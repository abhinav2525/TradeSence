import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { fetchBhavcopy, type BhavFormat, type BhavRow } from "./bhavcopy";

export type IngestResult =
  | { status: "ok"; rowCount: number; format: BhavFormat }
  | { status: "holiday" }
  | { status: "skipped" }
  | { status: "error"; message: string };

const SOURCE = "bhavcopy";

/** Postgres caps bind parameters at 65535; 10 columns means 1000 rows is safe. */
const CHUNK = 1000;

/**
 * Statuses that mean "this day is settled, do not fetch it again".
 *
 * Deliberately excludes "error": a day that failed on a transient network
 * problem must be retried by the next run, otherwise one blip becomes a
 * permanent hole in the series.
 */
const SETTLED = new Set(["ok", "holiday"]);

async function isSettled(dateIso: string): Promise<boolean> {
  const rows = await db
    .select({ status: schema.ingestLog.status })
    .from(schema.ingestLog)
    .where(and(eq(schema.ingestLog.tradeDate, dateIso), eq(schema.ingestLog.source, SOURCE)));
  return rows.length > 0 && SETTLED.has(rows[0]!.status);
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

  await upsertPrices(res.rows);
  await writeLog(dateIso, "ok", res.format, res.rows.length);
  return { status: "ok", rowCount: res.rows.length, format: res.format };
}
