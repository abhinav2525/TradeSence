/**
 * The three moving averages on adjusted closes, per gap segment: the one copy shared
 * by computeIndicators (NIFTY 50 members, scaled back into each day's rupees) and the
 * whole-market breadth (decision 0030), so the two can never disagree.
 */
import type { History } from "./history";
import { segmentByGaps } from "./gaps";
import { sma, ema } from "./moving-average";

export type Averages = {
  adjusted: number[];
  sma50: (number | null)[];
  sma200: (number | null)[];
  ema200: (number | null)[];
};

export function adjustedAverages(h: Pick<History, "dates" | "close" | "factors">): Averages {
  const adjusted = h.close.map((c, i) => c / h.factors[i]!);
  const n = adjusted.length;
  const out: Averages = { adjusted, sma50: new Array(n).fill(null), sma200: new Array(n).fill(null), ema200: new Array(n).fill(null) };
  // Each contiguous stretch on its own, so an average never spans a hole.
  for (const seg of segmentByGaps(h.dates)) {
    const s = seg.map((i) => adjusted[i]!);
    const a = sma(s, 50), b = sma(s, 200), c = ema(s, 200);
    seg.forEach((i, j) => { out.sma50[i] = a[j]!; out.sma200[i] = b[j]!; out.ema200[i] = c[j]!; });
  }
  return out;
}
