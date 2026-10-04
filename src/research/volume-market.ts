/**
 * Research 0004: does volume tell us anything across the whole market? Pure,
 * tested helpers; the runner is cli-volume-market.ts.
 * Spec: docs/superpowers/specs/2026-10-04-volume-whole-market-design.md.
 */
import { segmentByGaps } from "../indicators/gaps";
import type { History } from "../indicators/history";
import { sma } from "../indicators/moving-average";
import { forwardReturnSafe, segmentIds } from "../indicators/signals";
import { MAX_MOVE_GAP_DAYS, dayGap, liquidFlags, windowMean } from "../indicators/activity";
import { adjustedBars, cmf, crossFlags, fifthOf, obv, quietFlags } from "./volume";

export const CHART_HORIZONS = [1, 3, 5, 10, 21, 42, 63, 126] as const; // sessions after D+1
export const HUGE_X = 5;
const EPS = 1e-9; // thresholds on computed ratios (CLAUDE.md: never compare exactly)

export const MARKET_SIGNALS = [
  "Huge volume (≥ 5×), price up",
  "Huge volume (≥ 5×), price down",
  "Breakout above the 200-day average on heavy volume (≥ 2×)",
  "Breakdown below the 200-day average on heavy volume (≥ 2×)",
  "Buyers in control (Chaikin Money Flow, top fifth)",
  "Quiet buying (price down, On-Balance Volume up, 20 sessions)",
] as const;

export type VolumeSeries = {
  dates: string[];
  close: number[]; // adjusted
  volRatio: (number | null)[];
  move: (number | null)[];
  sma200: (number | null)[];
  cmf: (number | null)[];
  quietBuying: boolean[];
  eligible: boolean[];
  returns: (number | null)[][]; // [h][i] for CHART_HORIZONS, from the D+1 close
};

export function volumeSeries(h: History): VolumeSeries {
  const segs = segmentByGaps(h.dates);
  const seg = segmentIds(h.dates);
  const bars = adjustedBars(h);
  const volMean = windowMean(bars.volume, segs, 1);
  const volRatio = bars.volume.map((v, i) => (volMean[i] == null || volMean[i] === 0 ? null : v / volMean[i]!));
  const move = bars.close.map((c, i) =>
    i > 0 && seg[i] === seg[i - 1] && dayGap(h.dates[i - 1]!, h.dates[i]!) <= MAX_MOVE_GAP_DAYS ? (c / bars.close[i - 1]! - 1) * 100 : null);
  const sma200: (number | null)[] = new Array(h.dates.length).fill(null);
  for (const s of segs) {
    const m = sma(s.map((i) => bars.close[i]!), 200);
    s.forEach((i, j) => { sma200[i] = m[j]!; });
  }
  const n = h.dates.length;
  const returns = CHART_HORIZONS.map((hz) =>
    h.dates.map((_, i) => (i + 1 < n && seg[i + 1] === seg[i] ? forwardReturnSafe(bars.close, seg, i + 1, hz) : null)));
  return {
    dates: h.dates, close: bars.close, volRatio, move, sma200,
    cmf: cmf(bars), quietBuying: quietFlags(bars, obv(bars)).buying,
    eligible: liquidFlags(h.turnover, segs), returns,
  };
}

/** The six signals' flags, in MARKET_SIGNALS order. Only eligible days can fire. */
export function volumeSignalFlags(s: VolumeSeries, cmfCuts: number[]): boolean[][] {
  const n = s.dates.length;
  const cross = crossFlags(s.dates, s.close, s.sma200, s.volRatio);
  const out = MARKET_SIGNALS.map(() => new Array<boolean>(n).fill(false));
  for (let i = 0; i < n; i++) {
    if (!s.eligible[i]) continue;
    const vr = s.volRatio[i];
    const mv = s.move[i];
    const huge = vr != null && vr >= HUGE_X - EPS;
    out[0]![i] = huge && mv != null && mv > 0;
    out[1]![i] = huge && mv != null && mv < 0;
    out[2]![i] = cross.aboveHeavy[i]!; // crossFlags applies HEAVY (2×) itself
    out[3]![i] = cross.belowHeavy[i]!;
    const c = s.cmf[i];
    out[4]![i] = c != null && fifthOf(c, cmfCuts) === 4;
    out[5]![i] = s.quietBuying[i]!;
  }
  return out;
}
