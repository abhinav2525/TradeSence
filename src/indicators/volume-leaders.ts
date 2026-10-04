/** Top volume page: one stock's totals per rolling window (spec 2026-10-04). */
import type { History } from "./history";
import { segmentIds } from "./signals";
import { MAX_MOVE_GAP_DAYS, dayGap } from "./activity";

export const PERIODS = [1, 5, 21, 63, 126] as const;
export type Period = (typeof PERIODS)[number];
export type LeaderStat = { period: Period; turnover: number; shares: number; changePct: number | null; sessions: number };

/** Totals over each window [windowStarts[p], lastDay]; no row for a window the stock didn't trade in. */
/**
 * % move from the close before index `first` to the close at `last`, on adjusted
 * closes; null unless it ends on `lastDay` (the heading says "to <date>") and no
 * step inside it skips more than 5 calendar days: a stretch outside EQ/BE can hide
 * an unpriced demerger (HEGAM "−68%", decision 0024). Shared with Money flow.
 */
export function windowMove(h: History, first: number, last: number, lastDay: string): number | null {
  const before = first - 1;
  if (before < 0 || h.dates[last] !== lastDay) return null;
  const seg = segmentIds(h.dates);
  if (seg[before] !== seg[last]) return null;
  for (let i = before + 1; i <= last; i++) if (dayGap(h.dates[i - 1]!, h.dates[i]!) > MAX_MOVE_GAP_DAYS) return null;
  return (h.close[last]! / h.factors[last]! / (h.close[before]! / h.factors[before]!) - 1) * 100;
}

export function leaderStats(h: History, windowStarts: Record<Period, string>, lastDay: string): LeaderStat[] {
  return PERIODS.flatMap((p) => {
    const from = windowStarts[p];
    const idx = h.dates.flatMap((d, i) => (d >= from && d <= lastDay ? [i] : []));
    if (idx.length === 0) return [];
    const first = idx[0]!, last = idx.at(-1)!;
    return [{
      period: p,
      turnover: idx.reduce((s, i) => s + h.turnover[i]!, 0),
      shares: idx.reduce((s, i) => s + h.volume[i]! * h.shareFactors[i]!, 0),
      changePct: windowMove(h, first, last, lastDay),
      sessions: idx.length,
    }];
  });
}
