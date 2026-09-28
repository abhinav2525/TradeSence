import { sql } from "drizzle-orm";
import { db, schema } from "../db";
import { sma, ema } from "./moving-average";

/**
 * A gap longer than this means the series is discontinuous, not merely closed
 * for a holiday. NSE's longest normal break is a long weekend plus a holiday;
 * three weeks means data is genuinely missing.
 */
const MAX_GAP_DAYS = 21;

/**
 * Splits a date-ordered series wherever there is a hole.
 *
 * Moving averages count bars, not days, so without this a partially loaded
 * history would average 2018 closes together with 2024 closes and write the
 * result out as a perfectly ordinary non-null number.
 */
export function segmentByGaps(dates: string[], maxGapDays = MAX_GAP_DAYS): number[][] {
  const segments: number[][] = [];
  let current: number[] = [];

  for (let i = 0; i < dates.length; i++) {
    if (i > 0) {
      const prev = Date.parse(`${dates[i - 1]}T00:00:00Z`);
      const curr = Date.parse(`${dates[i]}T00:00:00Z`);
      if ((curr - prev) / 86_400_000 > maxGapDays) {
        segments.push(current);
        current = [];
      }
    }
    current.push(i);
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

const CHUNK = 1000;

/**
 * Recomputes moving averages for every index member and writes them to
 * `daily_indicators`.
 *
 * Runs per symbol, in date order, because the EMA recurrence depends on its own
 * previous value and cannot be expressed as a window function. Cheap enough to
 * recompute wholesale (50 symbols x ~2,500 days), so there is no incremental
 * path to get subtly wrong.
 */
export async function computeIndicators(indexName = "NIFTY50"): Promise<number> {
  const symbols = (
    await db.execute<{ symbol: string }>(
      sql`select distinct symbol from index_members where index_name = ${indexName}`,
    )
  ).map((r) => r.symbol);

  let written = 0;

  for (const symbol of symbols) {
    const prices = await db.execute<{ trade_date: string; close: number }>(
      sql`select trade_date, close
          from daily_prices
          where symbol = ${symbol} and series = 'EQ'
          order by trade_date asc`,
    );
    if (prices.length === 0) continue;

    const closes = prices.map((p) => Number(p.close));

    // Compute each contiguous stretch independently, so an average never spans
    // a hole in the history.
    const s50: (number | null)[] = new Array(closes.length).fill(null);
    const s200: (number | null)[] = new Array(closes.length).fill(null);
    const e200: (number | null)[] = new Array(closes.length).fill(null);

    for (const seg of segmentByGaps(prices.map((p) => p.trade_date))) {
      const segCloses = seg.map((i) => closes[i]!);
      const a = sma(segCloses, 50);
      const b = sma(segCloses, 200);
      const c = ema(segCloses, 200);
      seg.forEach((rowIndex, j) => {
        s50[rowIndex] = a[j]!;
        s200[rowIndex] = b[j]!;
        e200[rowIndex] = c[j]!;
      });
    }

    const rows = prices.map((p, i) => ({
      tradeDate: p.trade_date,
      symbol,
      close: closes[i]!,
      sma50: s50[i],
      sma200: s200[i],
      ema200: e200[i],
    }));

    for (let i = 0; i < rows.length; i += CHUNK) {
      await db
        .insert(schema.dailyIndicators)
        .values(rows.slice(i, i + CHUNK))
        .onConflictDoUpdate({
          target: [schema.dailyIndicators.tradeDate, schema.dailyIndicators.symbol],
          set: {
            close: sql`excluded.close`,
            sma50: sql`excluded.sma_50`,
            sma200: sql`excluded.sma_200`,
            ema200: sql`excluded.ema_200`,
          },
        });
    }
    written += rows.length;
  }

  return written;
}
