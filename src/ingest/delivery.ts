/**
 * Shares traded and shares delivered per stock per day, from NSE's
 * security-wise delivery file MTO_DDMMYYYY.DAT (decision 0021).
 *
 * Same archive and 404 behaviour as bhavcopy. Like index closes, only days
 * the price pipeline already logged as trading days (`ingest_log` 'ok') are
 * fetched, so the holiday rules live in one place; a day counts as done once
 * it has rows in `daily_delivery`.
 *
 * One format from at least 2012 to today. The column header names six fields
 * but rows carry seven: the series sits, unnamed, after the symbol.
 */
import { sql } from "drizzle-orm";
import { db, schema } from "../db";
import { download } from "./bhavcopy";

export type DeliveryRow = {
  tradeDate: string;
  symbol: string;
  series: string;
  tradedQty: number;
  deliverableQty: number;
};

// Rows are read by position (record type, sr no, symbol, series, traded,
// deliverable, %) because the series column has no name to look up. So the
// header is checked field by field at the positions it names them: header
// field 2 is the symbol, 3 traded, 4 deliverable (rows shift one right of the
// symbol). A plain "contains" check would match "Deliverable Quantity" inside
// the % column's name and miss a lost column.
const REQUIRED: [number, string][] = [[2, "Name of Security"], [3, "Quantity Traded"], [4, "Deliverable Quantity"]];

// NSE leaves BE out of this file, but keep the same set as daily_prices so a
// future BE row is not silently dropped.
const KEEP_SERIES = new Set(["EQ", "BE"]);

export function deliveryUrl(dateIso: string): string {
  const [y, m, d] = dateIso.split("-");
  return `https://nsearchives.nseindia.com/archives/equities/mto/MTO_${d}${m}${y}.DAT`;
}

const qty = (raw: string | undefined) => {
  const s = (raw ?? "").trim();
  return /^\d+$/.test(s) ? Number(s) : null;
};

/** Parses one day's file, checking it really is the day that was asked for. */
export function parseDelivery(text: string, dateIso: string): DeliveryRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const headerAt = lines.findIndex((l) => l.startsWith("Record Type,"));
  const header = (lines[headerAt] ?? "").split(",").map((c) => c.trim());
  const missing = REQUIRED.filter(([i, name]) => !header[i]?.startsWith(name)).map(([, name]) => name);
  if (headerAt < 0 || missing.length > 0) {
    throw new Error(`Unrecognised delivery file header (missing: ${missing.join(", ")})`);
  }

  // NSE's summary record, `10,MTO,DDMMYYYY,<total delivered>,<row count>`,
  // is the date source: the readable "Trade Date <…>" line has typos (30 Mar
  // 2017 says "rade Date"). Its two totals prove the whole file arrived and
  // was read: every type-20 row, every series, must add up to them.
  const summary = lines.find((l) => l.startsWith("10,"))?.split(",").map((c) => c.trim());
  if (!summary || summary.length < 5) throw new Error("Delivery file has no summary record");
  const [y, m, d] = dateIso.split("-");
  if (summary[2] !== `${d}${m}${y}`) {
    throw new Error(`Delivery file date ${summary[2]} does not match requested date ${d}${m}${y}`);
  }

  const byKey = new Map<string, DeliveryRow>(); // NSE can repeat a row
  let rowCount = 0;
  let deliveredTotal = 0;
  const otherDelivered: number[] = []; // rows in series we don't keep
  for (const line of lines.slice(headerAt + 1)) {
    const f = line.split(",");
    if (f[0]?.trim() !== "20") continue; // only record type 20 holds a security
    rowCount += 1;
    deliveredTotal += qty(f[5]) ?? NaN; // an unreadable row anywhere breaks the total
    const symbol = (f[2] ?? "").trim();
    const series = (f[3] ?? "").trim();
    if (!KEEP_SERIES.has(series)) {
      otherDelivered.push(qty(f[5]) ?? NaN);
      continue;
    }
    const tradedQty = qty(f[4]);
    const deliverableQty = qty(f[5]);
    // A row we keep but can't read fails the whole day: storing a guess (or a
    // zero) would look like a real figure forever.
    if (tradedQty === null || deliverableQty === null || deliverableQty > tradedQty) {
      throw new Error(`Unreadable delivery row for ${symbol}: ${line}`);
    }
    if (tradedQty === 0) continue; // nothing traded: no figure to keep
    byKey.set(`${symbol}|${series}`, { tradeDate: dateIso, symbol, series, tradedQty, deliverableQty });
  }
  const extraRows = rowCount - Number(summary[4]);
  const extraDelivered = deliveredTotal - Number(summary[3]);
  // The one tolerated mismatch: the summary leaves out exactly one row of a
  // series we don't keep (MTO_12102018.DAT, an X2 row; once in 2,482 days).
  // Anything else means rows we keep may be missing or misread.
  const oneOtherRowLeftOut = extraRows === 1 && otherDelivered.includes(extraDelivered);
  if (extraRows !== 0 && !oneOtherRowLeftOut) {
    throw new Error(`Delivery file has ${rowCount} rows but its summary record counts ${Number(summary[4])}`);
  }
  if (extraDelivered !== 0 && !oneOtherRowLeftOut) {
    throw new Error(`Delivery file's delivered shares add up to ${deliveredTotal}, not its summary total ${summary[3]}`);
  }
  return [...byKey.values()];
}

export type FetchDeliveryResult =
  | { status: "ok"; rows: DeliveryRow[] }
  | { status: "error"; message: string };

export async function fetchDeliveryDay(
  dateIso: string,
  deps: { download?: typeof download } = {},
): Promise<FetchDeliveryResult> {
  const get = deps.download ?? download;
  const res = await get(deliveryUrl(dateIso));
  if (res.kind !== "ok") {
    // Only trading days are asked for, so a 404 means "not published yet".
    return { status: "error", message: res.kind === "failed" ? res.message : "HTTP 404" };
  }
  try {
    const rows = parseDelivery(new TextDecoder().decode(res.bytes), dateIso);
    if (rows.length === 0) return { status: "error", message: "delivery file had no EQ rows" };
    return { status: "ok", rows };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/** Postgres caps bind parameters at 65535; 5 columns × 1000 rows is well under. */
const CHUNK = 1000;

/**
 * Loads delivery figures for every trading day in the range that isn't stored
 * yet. Idempotent and resumable, like the price backfill. A failed day stores
 * nothing and is tried again on the next run.
 */
export async function ingestDeliveryDays(
  startIso: string,
  endIso: string,
  opts: {
    download?: typeof download;
    delayMs?: number;
    onDay?: (d: string, res: FetchDeliveryResult) => void;
  } = {},
): Promise<{ ok: number; error: number }> {
  const days = (
    await db.execute<{ d: string }>(sql`
      select l.trade_date::text as d
      from ingest_log l
      where l.source = 'bhavcopy' and l.status = 'ok'
        and l.trade_date between ${startIso} and ${endIso}
        and not exists (select 1 from daily_delivery v where v.trade_date = l.trade_date)
      order by l.trade_date`)
  ).map((r) => r.d);

  const tally = { ok: 0, error: 0 };
  for (const [i, day] of days.entries()) {
    const res = await fetchDeliveryDay(day, { download: opts.download });
    if (res.status === "ok") {
      // One transaction per day: "has rows" is what marks a day done, so a
      // crash between chunks must leave no rows rather than half a day.
      await db.transaction(async (tx) => {
        for (let c = 0; c < res.rows.length; c += CHUNK) {
          await tx.insert(schema.dailyDelivery).values(res.rows.slice(c, c + CHUNK)).onConflictDoNothing();
        }
      });
      tally.ok += 1;
    } else {
      tally.error += 1;
    }
    opts.onDay?.(day, res);
    if (i < days.length - 1) await new Promise((r) => setTimeout(r, opts.delayMs ?? 300));
  }
  return tally;
}
