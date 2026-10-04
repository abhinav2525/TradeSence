/**
 * Per-stock delivery and volume maths shared by research 0003 and the Unusual
 * activity page, so the study and the page can never disagree. Spec:
 * docs/superpowers/specs/2026-10-04-unusual-activity-design.md.
 */
import { segmentByGaps } from "./gaps";
import type { History } from "./history";
import { median, segmentIds } from "./signals";

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
export const KEPT_X = 5; // delivered shares vs normal
export const VOLUME_X = 5; // traded shares vs normal
export const JUMP_PTS = 30; // delivery % vs normal, either way
// A threshold is met within this: a mean of whole shares × a bonus factor can land a
// hair under an exact 5× (4.999999999999999), and that day must count (CLAUDE.md).
const EPS = 1e-9;
// A "day's move" against an EQ close further back than this is not a day's move: the
// stock traded in another series (BE) in between, maybe across an unpriced demerger
// (HEGAM 22 Sep 2026 showed −68%). The longest normal NSE break is a 4-day weekend.
export const MAX_MOVE_GAP_DAYS = 5;

export type Kind = "kept" | "volume" | "jump" | "collapse";
export const KINDS: readonly Kind[] = ["kept", "volume", "jump", "collapse"];

export type UnusualRow = {
  tradeDate: string;
  kept: boolean;
  volume: boolean;
  jump: boolean;
  collapse: boolean;
  keptRatio: number | null; // adjusted delivered shares ÷ previous-20-session mean
  volumeRatio: number | null; // adjusted traded shares ÷ previous-20-session mean
  deliveryPct: number | null;
  usualDeliveryPct: number | null;
  changePct: number | null; // adjusted close vs previous session, %
  turnover: number; // ₹ traded that day
};

export const dayGap = (a: string, b: string) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;
const ratio = (x: number | null, m: number | null) => (x === null || m === null || m === 0 ? null : x / m);

/** One company's unusual sessions: liquid days where at least one kind fires (spec thresholds). */
export function unusualDays(h: History): UnusualRow[] {
  const segs = segmentByGaps(h.dates);
  const seg = segmentIds(h.dates);
  const has = (i: number) => !EXCLUDED_DAYS.has(h.dates[i]!) && h.traded[i] != null && h.delivered[i] != null && h.traded[i]! > 0;
  // × 100 before ÷, so whole-number shares give exact percentages: (700/1000)*100 can land a
  // hair under 70, and a stock at exactly +30 points must count.
  const dp = h.dates.map((_, i) => (has(i) ? (h.delivered[i]! * 100) / h.traded[i]! : null));
  const delivered = h.dates.map((_, i) => (has(i) ? h.delivered[i]! * h.shareFactors[i]! : null));
  const volume = h.volume.map((v, i) => v * h.shareFactors[i]!);
  const usual = windowMean(dp, segs, 1);
  const delMean = windowMean(delivered, segs, 1);
  const volMean = windowMean(volume, segs, 1);
  const liquid = liquidFlags(h.turnover, segs);
  const close = h.close.map((c, i) => c / h.factors[i]!);

  const out: UnusualRow[] = [];
  h.dates.forEach((d, i) => {
    if (!liquid[i]) return;
    const keptRatio = ratio(delivered[i]!, delMean[i]!);
    const volumeRatio = ratio(volume[i]!, volMean[i]!);
    const p = dp[i]!;
    const u = usual[i]!;
    const row: UnusualRow = {
      tradeDate: d,
      kept: keptRatio !== null && keptRatio >= KEPT_X - EPS,
      volume: volumeRatio !== null && volumeRatio >= VOLUME_X - EPS,
      jump: p !== null && u !== null && p - u >= JUMP_PTS - EPS,
      collapse: p !== null && u !== null && u - p >= JUMP_PTS - EPS,
      keptRatio, volumeRatio, deliveryPct: p, usualDeliveryPct: u,
      changePct: i > 0 && seg[i] === seg[i - 1] && dayGap(h.dates[i - 1]!, d) <= MAX_MOVE_GAP_DAYS
        ? (close[i]! / close[i - 1]! - 1) * 100
        : null,
      turnover: h.turnover[i]!,
    };
    if (row.kept || row.volume || row.jump || row.collapse) out.push(row);
  });
  return out;
}

/** How unusual, for sorting: the largest of each measure ÷ its threshold. */
export function unusualScore(r: Pick<UnusualRow, "keptRatio" | "volumeRatio" | "deliveryPct" | "usualDeliveryPct">): number {
  const parts = [(r.keptRatio ?? 0) / KEPT_X, (r.volumeRatio ?? 0) / VOLUME_X];
  if (r.deliveryPct !== null && r.usualDeliveryPct !== null) parts.push(Math.abs(r.deliveryPct - r.usualDeliveryPct) / JUMP_PTS);
  return Math.max(0, ...parts);
}

// A display label, not a signal: study 0005 found the size of an up day's jump, not its
// volume, goes with the weaker month after; +8% is the edge of its big-jump bands.
export const BIG_JUMP_PCT = 8;
export function isBigJump(changePct: number | null): boolean {
  return changePct !== null && changePct >= BIG_JUMP_PCT - EPS;
}
