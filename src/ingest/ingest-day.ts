import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { fetchBhavcopy, type BhavFormat, type BhavRow } from "./bhavcopy";

export type IngestResult =
  | { status: "ok"; rowCount: number; format: BhavFormat }
  | { status: "holiday" }
  | { status: "skipped" }
  | { status: "error"; message: string };

const SOURCE = "bhavcopy";

/**
 * Confirms the file is for the day we asked for.
 *
 * `daily_prices` is keyed on the date inside the file while `ingest_log` is
 * keyed on the date we requested. If those ever diverge, the log would mark a
 * day settled while its prices landed elsewhere — an invisible one-day hole.
 * NSE's 52-week file already has exactly this off-by-one, so it is not
 * hypothetical for the archive as a whole.
 */
export function assertDateMatches(dateIso: string, rows: BhavRow[]): boolean {
  return rows.every((r) => r.tradeDate === dateIso);
}

/** Postgres caps bind parameters at 65535; 10 columns means 1000 rows is safe. */
const CHUNK = 1000;

/**
 * How long after a session a recorded "holiday" stops being a guess.
 *
 * NSE answers a not-yet-published file with the same 404 it uses for a real
 * holiday, so the two are indistinguishable at fetch time. A holiday recorded
 * shortly after the close may simply mean the file was late; treating it as
 * final would leave a permanent hole that nothing ever corrects. After a couple
 * of days a 404 genuinely does mean there was no session.
 */
const HOLIDAY_GRACE_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Whether a day needs no further fetching.
 *
 * - `ok`      always settled.
 * - `holiday` settled only once the grace period has passed (see above).
 * - `error`   never settled — a transient failure must be retried, or one blip
 *             becomes permanent missing data.
 */
export async function isSettled(dateIso: string): Promise<boolean> {
  const rows = await db
    .select({ status: schema.ingestLog.status, fetchedAt: schema.ingestLog.fetchedAt })
    .from(schema.ingestLog)
    .where(and(eq(schema.ingestLog.tradeDate, dateIso), eq(schema.ingestLog.source, SOURCE)));

  const row = rows[0];
  if (!row) return false;
  if (row.status === "ok") return true;
  if (row.status !== "holiday") return false;

  const sessionEnd = new Date(`${dateIso}T00:00:00Z`).getTime();
  return row.fetchedAt.getTime() - sessionEnd >= HOLIDAY_GRACE_MS;
}

async function writeLog(
  dateIso: string,
  status: string,
  format: BhavFormat | null,
  rowCount: number | null,
) {
  await db
    .insert(schema.ingestLog)
    .values({ tradeDate: dateIso, source: SOURCE, status, format, rowCount })
    .onConflictDoUpdate({
      target: [schema.ingestLog.tradeDate, schema.ingestLog.source],
      set: { status, format, rowCount, fetchedAt: new Date() },
    });
}

async function upsertPrices(rows: BhavRow[]) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await db
      .insert(schema.dailyPrices)
      .values(chunk)
      .onConflictDoUpdate({
        target: [schema.dailyPrices.tradeDate, schema.dailyPrices.symbol, schema.dailyPrices.series],
        // `excluded` is the row postgres tried and failed to insert.
        set: {
          open: sql`excluded.open`,
          high: sql`excluded.high`,
          low: sql`excluded.low`,
          close: sql`excluded.close`,
          prevClose: sql`excluded.prev_close`,
          volume: sql`excluded.volume`,
          turnover: sql`excluded.turnover`,
        },
      });
  }
}

/**
 * Ingests one trading day.
 *
 * Idempotent twice over: it short-circuits if the day is already settled, and
 * the underlying write is an upsert, so a forced re-run changes nothing.
 *
 * Prices are written before the log, deliberately and without a transaction.
 * If the process dies between the two, the day has no log row, so the next run
 * re-fetches and re-upserts it — harmless. The reverse order could record a day
 * as "ok" with no prices behind it, which nothing would ever correct.
 */
export async function ingestDay(
  dateIso: string,
  opts: { force?: boolean } = {},
): Promise<IngestResult> {
  if (!opts.force && (await isSettled(dateIso))) return { status: "skipped" };

  const res = await fetchBhavcopy(dateIso);

  if (res.status === "error") {
    await writeLog(dateIso, "error", null, null);
    return { status: "error", message: res.message };
  }
  if (res.status === "holiday") {
    await writeLog(dateIso, "holiday", null, 0);
    return { status: "holiday" };
  }

  if (!assertDateMatches(dateIso, res.rows)) {
    const seen = [...new Set(res.rows.map((r) => r.tradeDate))].slice(0, 3).join(", ");
    await writeLog(dateIso, "error", null, null);
    return {
      status: "error",
      message: `Requested ${dateIso} but the file reports ${seen || "no dates"}`,
    };
  }

  await upsertPrices(res.rows);
  await writeLog(dateIso, "ok", res.format, res.rows.length);
  return { status: "ok", rowCount: res.rows.length, format: res.format };
}
