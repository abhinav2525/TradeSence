/**
 * Research 0003: does delivery % tell us anything? Pure, tested helpers; the
 * runner is cli-delivery.ts. Spec: docs/superpowers/specs/2026-10-04-delivery-study-design.md.
 */
import { segmentByGaps } from "../indicators/gaps";
import type { History } from "../indicators/history";
import { forwardReturnSafe, median, segmentIds } from "../indicators/signals";
import { STUDY_HORIZONS } from "./volume";

export const WINDOW = 20; // sessions: "its own normal"
export const MIN_PRESENT = 15; // of WINDOW sessions with a delivery figure
export const MIN_TURNOVER = 1e7; // ₹1 crore: median of the last WINDOW sessions
export const DISCOVERY_END = "2022-12-31";
export const MIN_EPISODES = 30;
export const MIN_EFFECT = 0.5; // percentage points at the main span: roughly a round trip's costs
export const HOLDOUT_BAR = 95; // one-sided: discovery already fixed the direction
// The delivery file covers different trades than bhavcopy on these days (decision 0021).
export const EXCLUDED_DAYS = new Set(["2019-06-17", "2019-06-18", "2023-09-04", "2025-10-21", "2026-09-11"]);

/**
 * Mean of `v` over a window inside each segment: offset 1 = the WINDOW sessions
 * before i; offset 0 = i and the WINDOW − 1 before it. Missing values are
 * skipped; null with fewer than MIN_PRESENT present.
 */
export function windowMean(v: (number | null)[], segs: number[][], offset: 0 | 1): (number | null)[] {
  const out: (number | null)[] = new Array(v.length).fill(null);
  for (const seg of segs) {
    seg.forEach((i, j) => {
      let sum = 0;
      let n = 0;
      for (let k = Math.max(0, j - WINDOW + 1 - offset); k <= j - offset; k++) {
        const x = v[seg[k]!];
        if (x != null) { sum += x; n++; }
      }
      out[i] = n >= MIN_PRESENT ? sum / n : null;
    });
  }
  return out;
}

export type StockSeries = {
  dates: string[];
  dp: (number | null)[]; // delivery %
  rel: (number | null)[]; // dp − its previous-20-session mean, in points
  spike: (number | null)[]; // adjusted delivered shares ÷ previous-20-session mean
  level: (number | null)[]; // mean dp over today and the previous 19
  move: (number | null)[]; // adjusted close % change from the previous session
  eligible: boolean[];
  returns: (number | null)[][]; // [h][i]: adjusted close D+1 → D+1+STUDY_HORIZONS[h]
};

export function stockSeries(h: History): StockSeries {
  const n = h.dates.length;
  const segs = segmentByGaps(h.dates);
  const seg = segmentIds(h.dates);
  const close = h.close.map((c, i) => c / h.factors[i]!);
  const has = (i: number) => !EXCLUDED_DAYS.has(h.dates[i]!) && h.traded[i] != null && h.delivered[i] != null && h.traded[i]! > 0;
  const dp = h.dates.map((_, i) => (has(i) ? (h.delivered[i]! / h.traded[i]!) * 100 : null));
  const delivered = h.dates.map((_, i) => (has(i) ? h.delivered[i]! * h.shareFactors[i]! : null));

  const usual = windowMean(dp, segs, 1);
  const rel = dp.map((x, i) => (x === null || usual[i] === null ? null : x - usual[i]!));
  const delMean = windowMean(delivered, segs, 1);
  const spike = delivered.map((x, i) => (x === null || delMean[i] == null || delMean[i] === 0 ? null : x / delMean[i]!));
  const level = windowMean(dp, segs, 0);
  const move = close.map((c, i) => (i > 0 && seg[i] === seg[i - 1] ? (c / close[i - 1]! - 1) * 100 : null));

  // Liquid: median turnover over the last WINDOW sessions of the same segment.
  const liquid: boolean[] = new Array(n).fill(false);
  for (const s of segs) {
    s.forEach((i, j) => {
      if (j < WINDOW - 1) return;
      const t = s.slice(j - WINDOW + 1, j + 1).map((k) => h.turnover[k]!);
      liquid[i] = median(t)! >= MIN_TURNOVER;
    });
  }
  const eligible = h.dates.map((_, i) => liquid[i]! && dp[i] !== null && usual[i] !== null);

  const returns = STUDY_HORIZONS.map((hz) =>
    h.dates.map((_, i) => (i + 1 < n && seg[i + 1] === seg[i] ? forwardReturnSafe(close, seg, i + 1, hz) : null)),
  );
  return { dates: h.dates, dp, rel, spike, level, move, eligible, returns };
}
