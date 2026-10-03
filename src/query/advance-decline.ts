/**
 * Advance/Decline for the NIFTY 50: how many members rose against how many fell,
 * and the standard instruments built on that count.
 *
 * Each member's daily move comes from `daily_indicators.change_pct`, which is
 * computed on the split/demerger-adjusted series joined across renames, so a
 * split day is not a fake decline (decision 0008). Membership is per date, as
 * in breadthSeries. The instruments are derived here in TypeScript rather than
 * stored: a few thousand sessions, recomputed per request.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { ema } from "../indicators/moving-average";
import { segmentByGaps } from "../indicators/gaps";

export type AdCounts = { date: string; advancing: number; declining: number; unchanged: number };

export type AdPoint = AdCounts & {
  net: number; // advancing − declining
  rana: number; // (A − D) ÷ (A + D) × 1,000; 0 when nothing moved
  advShare: number; // A ÷ (A + D) in %; 50 when nothing moved
  mcclellan: number | null; // EMA19(rana) − EMA39(rana)
  summation: number | null; // running sum of mcclellan
  adLine: number; // running sum of net; only its slope means anything
  adv10: number | null; // EMA10 of advShare: the breadth-thrust input
};

/**
 * Adds every instrument to the daily counts. Each contiguous stretch of
 * sessions is computed on its own (segmentByGaps), so no average or running
 * sum spans a hole in the data.
 */
export function deriveAdvanceDecline(rows: AdCounts[]): AdPoint[] {
  const out: AdPoint[] = rows.map((r) => {
    const moved = r.advancing + r.declining;
    return {
      ...r,
      net: r.advancing - r.declining,
      rana: moved === 0 ? 0 : ((r.advancing - r.declining) / moved) * 1000,
      advShare: moved === 0 ? 50 : (r.advancing / moved) * 100,
      mcclellan: null, summation: null, adLine: 0, adv10: null,
    };
  });

  for (const seg of segmentByGaps(rows.map((r) => r.date))) {
    const pts = seg.map((i) => out[i]!);
    const e19 = ema(pts.map((p) => p.rana), 19);
    const e39 = ema(pts.map((p) => p.rana), 39);
    const e10 = ema(pts.map((p) => p.advShare), 10);
    let summation: number | null = null;
    let line = 0;
    pts.forEach((p, j) => {
      p.mcclellan = e19[j] !== null && e39[j] !== null ? e19[j]! - e39[j]! : null;
      if (p.mcclellan !== null) summation = (summation ?? 0) + p.mcclellan;
      p.summation = summation;
      line += p.net;
      p.adLine = line;
      p.adv10 = e10[j] ?? null;
    });
  }
  return out;
}

/** Daily advancing / declining / unchanged counts for the index's members on each date. */
export async function advanceDeclineCounts(indexName = "NIFTY50"): Promise<AdCounts[]> {
  const rows = await db.execute<{ date: string; advancing: number; declining: number; unchanged: number }>(sql`
    select i.trade_date::text                                  as date,
           count(distinct i.symbol) filter (where i.change_pct > 0)::int as advancing,
           count(distinct i.symbol) filter (where i.change_pct < 0)::int as declining,
           count(distinct i.symbol) filter (where i.change_pct = 0)::int as unchanged
    from daily_indicators i
    join index_members m
      on m.symbol = i.symbol
     and m.index_name = ${indexName}
     and i.trade_date >= m.added_on
     and (m.removed_on is null or i.trade_date < m.removed_on)
    where i.change_pct is not null
    group by i.trade_date
    order by i.trade_date asc
  `);
  return rows.map((r) => ({
    date: r.date,
    advancing: Number(r.advancing),
    declining: Number(r.declining),
    unchanged: Number(r.unchanged),
  }));
}

export async function advanceDeclineSeries(indexName = "NIFTY50"): Promise<AdPoint[]> {
  return deriveAdvanceDecline(await advanceDeclineCounts(indexName));
}
