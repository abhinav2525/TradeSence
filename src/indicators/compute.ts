import { sql } from "drizzle-orm";
import { db, schema } from "../db";
import { sma, ema } from "./moving-average";

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
    const s50 = sma(closes, 50);
    const s200 = sma(closes, 200);
    const e200 = ema(closes, 200);

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
