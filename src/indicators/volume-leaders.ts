/** Top volume page: one stock's totals per rolling window (spec 2026-10-04). */
import type { History } from "./history";
import { segmentIds } from "./signals";
import { MAX_MOVE_GAP_DAYS, dayGap } from "./activity";

export const PERIODS = [1, 5, 21, 63, 126] as const;
export type Period = (typeof PERIODS)[number];
export type LeaderStat = { period: Period; turnover: number; shares: number; changePct: number | null; sessions: number };

/** Totals over each window [windowStarts[p], lastDay]; no row for a window the stock didn't trade in. */
export function leaderStats(h: History, windowStarts: Record<Period, string>, lastDay: string): LeaderStat[] {
  const seg = segmentIds(h.dates);
  const close = h.close.map((c, i) => c / h.factors[i]!);
  // A move is shown only if it ends on the latest session (the heading says "to
  // <date>") and no step inside it skips more than 5 calendar days: a stretch
  // outside EQ/BE can hide an unpriced demerger (HEGAM "−68%", decision 0024).
  const moveOk = (before: number, last: number) => {
    if (before < 0 || h.dates[last] !== lastDay || seg[before] !== seg[last]) return false;
    for (let i = before + 1; i <= last; i++) if (dayGap(h.dates[i - 1]!, h.dates[i]!) > MAX_MOVE_GAP_DAYS) return false;
    return true;
  };
  return PERIODS.flatMap((p) => {
    const from = windowStarts[p];
    const idx = h.dates.flatMap((d, i) => (d >= from && d <= lastDay ? [i] : []));
    if (idx.length === 0) return [];
    const first = idx[0]!, last = idx.at(-1)!;
    const before = first - 1;
    return [{
      period: p,
      turnover: idx.reduce((s, i) => s + h.turnover[i]!, 0),
      shares: idx.reduce((s, i) => s + h.volume[i]! * h.shareFactors[i]!, 0),
      changePct: moveOk(before, last) ? (close[last]! / close[before]! - 1) * 100 : null,
      sessions: idx.length,
    }];
  });
}
