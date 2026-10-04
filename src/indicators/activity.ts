/**
 * Per-stock delivery and volume maths shared by research 0003 and the Unusual
 * activity page, so the study and the page can never disagree. Spec:
 * docs/superpowers/specs/2026-10-04-unusual-activity-design.md.
 */
import { segmentByGaps } from "./gaps";
import { median } from "./signals";

export const WINDOW = 20; // sessions: "its own normal"
export const MIN_PRESENT = 15; // of WINDOW sessions with a delivery figure
export const MIN_TURNOVER = 1e7; // ₹1 crore: median of the last WINDOW sessions
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

/** True where the median turnover of the last WINDOW sessions (same segment) is ≥ MIN_TURNOVER. */
export function liquidFlags(turnover: number[], segs: number[][]): boolean[] {
  const out: boolean[] = new Array(turnover.length).fill(false);
  for (const s of segs) {
    s.forEach((i, j) => {
      if (j < WINDOW - 1) return;
      out[i] = median(s.slice(j - WINDOW + 1, j + 1).map((k) => turnover[k]!))! >= MIN_TURNOVER;
    });
  }
  return out;
}
