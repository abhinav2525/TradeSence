import { sql } from "drizzle-orm";
import { db, schema } from "../db";
import { sma, ema } from "./moving-average";
import { segmentByGaps } from "./gaps";
import { volumeRatios } from "./volume";
import { findUnexplainedJumps, type UnexplainedJump } from "./adjust";
import { loadAdjustedHistory, loadRenames } from "./history";

export { segmentByGaps } from "./gaps";

const CHUNK = 1000;

/**
 * Recomputes moving averages for every index member and writes them to
 * `daily_indicators`.
 *
 * Runs per symbol, in date order, because the EMA recurrence depends on its own
 * previous value and cannot be expressed as a window function. Cheap enough to
 * recompute wholesale (50 symbols x ~2,500 days), so there is no incremental
 * path to get subtly wrong.
 *
 * Splits and bonuses: the averages are computed on closes adjusted by
 * `corporate_actions`, then scaled back by each day's own factor. So every
 * stored average is in the rupees that day actually traded at — the same units
 * as its `close` — and the breadth/crossings queries compare like with like
 * without knowing adjustment exists. `close` itself stays the raw bhavcopy price.
 * See docs/decisions/0002-split-adjusted-averages.md.
 *
 * Renames: a member's history includes every symbol it traded under before
 * (ZOMATO for ETERNAL), each only for the dates it belonged to this company,
 * all written under today's symbol. See docs/decisions/0003.
 *
 * Loading and adjustment live in history.ts, shared with the research scripts.
 */
export async function computeIndicators(
  indexName = "NIFTY50",
  opts: { onUnexplainedJump?: (j: UnexplainedJump & { symbol: string }) => void } = {},
): Promise<number> {
  const symbols = (
    await db.execute<{ symbol: string }>(
      sql`select distinct symbol from index_members where index_name = ${indexName}`,
    )
  ).map((r) => r.symbol);

  const renames = await loadRenames();

  let written = 0;

  for (const symbol of symbols) {
    const h = await loadAdjustedHistory(symbol, renames);
    if (!h) continue;
    const { dates, close: closes, factors, shareFactors } = h;
    const volRatio = volumeRatios(dates, h.volume, shareFactors);
    const adjusted = closes.map((c, i) => c / factors[i]!);

    for (const jump of findUnexplainedJumps(dates, closes, factors)) {
      opts.onUnexplainedJump?.({ symbol, ...jump });
    }

    // Compute each contiguous stretch independently, so an average never spans
    // a hole in the history.
    const s50: (number | null)[] = new Array(closes.length).fill(null);
    const s200: (number | null)[] = new Array(closes.length).fill(null);
    const e200: (number | null)[] = new Array(closes.length).fill(null);
    const move: (number | null)[] = new Array(closes.length).fill(null);

    for (const seg of segmentByGaps(dates)) {
      const segCloses = seg.map((i) => adjusted[i]!);
      const a = sma(segCloses, 50);
      const b = sma(segCloses, 200);
      const c = ema(segCloses, 200);
      // Back into that day's own rupees, so it compares directly with `close`.
      const unadjust = (v: number | null, f: number) => (v === null ? null : v * f);
      seg.forEach((rowIndex, j) => {
        // The day's move, on the adjusted series: a split day moves by what the
        // stock actually did, not by the split. A segment's first day has none.
        if (j > 0) move[rowIndex] = (adjusted[rowIndex]! / adjusted[seg[j - 1]!]! - 1) * 100;
        const f = factors[rowIndex]!;
        s50[rowIndex] = unadjust(a[j]!, f);
        s200[rowIndex] = unadjust(b[j]!, f);
        e200[rowIndex] = unadjust(c[j]!, f);
      });
    }

    const rows = dates.map((d, i) => ({
      tradeDate: d,
      symbol,
      close: closes[i]!,
      sma50: s50[i],
      sma200: s200[i],
      ema200: e200[i],
      changePct: move[i],
      volRatio: volRatio[i],
      turnover: h.turnover[i]!,
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
            changePct: sql`excluded.change_pct`,
            volRatio: sql`excluded.vol_ratio`,
            turnover: sql`excluded.turnover`,
          },
        });
    }
    written += rows.length;
  }

  return written;
}
