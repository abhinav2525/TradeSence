import { inArray, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { segmentByGaps } from "./gaps";
import { volumeRatios } from "./volume";
import { findUnexplainedJumps, type UnexplainedJump } from "./adjust";
import { loadAdjustedHistory, loadRenames } from "./history";
import { adjustedAverages } from "./averages";
import { INDICES } from "../ingest/indices";

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
 *
 * Indices: by default every registered index (`ingest/indices.ts`: the NIFTY 50
 * and Nifty Bank), members past and present, each stock once however many
 * indices list it. A stock's numbers depend only on its own prices, so adding an
 * index never changes another index's rows (decision 0034).
 */
export async function computeIndicators(
  indexNames: string | readonly string[] = INDICES.map((x) => x.members),
  opts: { onUnexplainedJump?: (j: UnexplainedJump & { symbol: string }) => void } = {},
): Promise<number> {
  const names = typeof indexNames === "string" ? [indexNames] : [...indexNames];
  const symbols = (
    await db.selectDistinct({ symbol: schema.indexMembers.symbol }).from(schema.indexMembers)
      .where(inArray(schema.indexMembers.indexName, names))
  ).map((r) => r.symbol).sort();

  const renames = await loadRenames();

  let written = 0;

  for (const symbol of symbols) {
    const h = await loadAdjustedHistory(symbol, renames);
    if (!h) continue;
    const { dates, close: closes, factors, shareFactors } = h;
    const volRatio = volumeRatios(dates, h.volume, shareFactors);
    // The averages on adjusted closes, per gap segment (shared with whole-market breadth).
    const av = adjustedAverages(h);
    const adjusted = av.adjusted;

    for (const jump of findUnexplainedJumps(dates, closes, factors)) {
      opts.onUnexplainedJump?.({ symbol, ...jump });
    }

    // Back into that day's own rupees, so each average compares directly with `close`.
    const unadjust = (v: number | null, i: number) => (v === null ? null : v * factors[i]!);
    const s50 = av.sma50.map(unadjust);
    const s200 = av.sma200.map(unadjust);
    const e200 = av.ema200.map(unadjust);

    // The day's move, on the adjusted series: a split day moves by what the stock
    // actually did, not by the split. A segment's first day has none.
    const move: (number | null)[] = new Array(closes.length).fill(null);
    for (const seg of segmentByGaps(dates)) {
      seg.forEach((rowIndex, j) => {
        if (j > 0) move[rowIndex] = (adjusted[rowIndex]! / adjusted[seg[j - 1]!]! - 1) * 100;
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
