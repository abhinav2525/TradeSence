/**
 * Daily closes of every NSE index, from NSE's ind_close_all_DDMMYYYY.csv.
 *
 * Same archive as bhavcopy, same 404-on-holiday behaviour. To avoid a second
 * copy of the holiday rules, only days the price pipeline already logged as
 * trading days (`ingest_log` status 'ok') are fetched.
 */
import { sql } from "drizzle-orm";
import { db, schema } from "../db";
import { download } from "./bhavcopy";

export type IndexPriceRow = {
  tradeDate: string;
  indexName: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
};

// Every column the parser reads. A rename at NSE must fail loudly, not
// silently write nulls (the same rule as the bhavcopy parsers).
const REQUIRED = [
  "Index Name", "Index Date", "Open Index Value", "High Index Value",
  "Low Index Value", "Closing Index Value",
];

export function indexCloseUrl(dateIso: string): string {
  const [y, m, d] = dateIso.split("-");
  return `https://nsearchives.nseindia.com/content/indices/ind_close_all_${d}${m}${y}.csv`;
}

const num = (raw: string | undefined) => {
  const v = Number((raw ?? "").trim());
  return (raw ?? "").trim() !== "" && Number.isFinite(v) ? v : null;
};

/** Parses one day's file, checking it really is the day that was asked for. */
export function parseIndexClose(csv: string, dateIso: string): IndexPriceRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  const cols = (lines[0] ?? "").split(",").map((c) => c.trim());
  const missing = REQUIRED.filter((c) => !cols.includes(c));
  if (missing.length > 0) {
    throw new Error(`Unrecognised index file header (missing: ${missing.join(", ")})`);
  }
  const at = (name: string) => cols.indexOf(name);
  const [iName, iDate, iOpen, iHigh, iLow, iClose] = REQUIRED.map(at) as [number, number, number, number, number, number];
  const [y, m, d] = dateIso.split("-");
  const expected = `${d}-${m}-${y}`;
  // A few files (6, 10, 11 April 2023) write the date month-first. Accept the
  // requested day in that order too; any other date is still a wrong file.
  const monthFirst = `${m}-${d}-${y}`;

  const rows: IndexPriceRow[] = [];
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    const fileDate = (f[iDate] ?? "").trim();
    if (fileDate !== expected && fileDate !== monthFirst) {
      throw new Error(`Index file date ${f[iDate]} does not match requested date ${expected}`);
    }
    const close = num(f[iClose]);
    if (close === null || close <= 0) continue; // no usable close: not a price
    rows.push({
      tradeDate: dateIso,
      indexName: (f[iName] ?? "").trim(),
      open: num(f[iOpen]), high: num(f[iHigh]), low: num(f[iLow]), close,
    });
  }
  return rows;
}

export type FetchIndexResult =
  | { status: "ok"; rows: IndexPriceRow[] }
  | { status: "error"; message: string };

export async function fetchIndexDay(
  dateIso: string,
  deps: { download?: typeof download } = {},
): Promise<FetchIndexResult> {
  const get = deps.download ?? download;
  const res = await get(indexCloseUrl(dateIso));
  if (res.kind !== "ok") {
    // A trading day's file should exist; a 404 here means "not published yet".
    return { status: "error", message: res.kind === "failed" ? res.message : "HTTP 404" };
  }
  try {
    const rows = parseIndexClose(new TextDecoder().decode(res.bytes), dateIso);
    if (rows.length === 0) return { status: "error", message: "index file had no rows" };
    return { status: "ok", rows };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Loads index closes for every trading day in the range that isn't stored
 * yet. Idempotent and resumable, like the price backfill. A failed day
 * stores nothing and is simply tried again on the next run.
 */
export async function ingestIndexDays(
  startIso: string,
  endIso: string,
  opts: { download?: typeof download; delayMs?: number; onDay?: (d: string, ok: boolean) => void } = {},
): Promise<{ ok: number; error: number }> {
  const days = (
    await db.execute<{ d: string }>(sql`
      select l.trade_date::text as d
      from ingest_log l
      where l.source = 'bhavcopy' and l.status = 'ok'
        and l.trade_date between ${startIso} and ${endIso}
        and not exists (select 1 from index_prices p where p.trade_date = l.trade_date)
      order by l.trade_date`)
  ).map((r) => r.d);

  const tally = { ok: 0, error: 0 };
  for (const [i, day] of days.entries()) {
    const res = await fetchIndexDay(day, { download: opts.download });
    if (res.status === "ok") {
      await db.insert(schema.indexPrices).values(res.rows).onConflictDoNothing();
      tally.ok += 1;
    } else {
      tally.error += 1;
    }
    opts.onDay?.(day, res.status === "ok");
    if (i < days.length - 1) await new Promise((r) => setTimeout(r, opts.delayMs ?? 300));
  }
  return tally;
}
