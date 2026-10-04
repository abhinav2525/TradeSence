/**
 * Research 0005: volume or the jump? Pure helpers; runner cli-volume-or-jump.ts.
 * Spec: docs/superpowers/specs/2026-10-04-volume-or-jump-design.md.
 */
import { segmentByGaps } from "../indicators/gaps";
import { WINDOW } from "../indicators/activity";
import { median, segmentIds } from "../indicators/signals";
import { HEAVY, LIGHT, quantile, sameWay } from "./volume";
import { HUGE_X } from "./volume-market";
import { HOLDOUT_BAR, MIN_EFFECT, MIN_EPISODES, type Part } from "./delivery";

const EPS = 1e-9;
export const Q1_BANDS = [3, 5, 8, 12] as const; // day's move, %: [3,5) [5,8) [8,12) [12,∞)
export const Q2_BANDS = [1, 3, 5, 8] as const; // breakouts: (−∞,1) [1,3) [3,5) [5,8) [8,∞)
export const JUMP_FLOOR = 3;
export const SETTLED_BELOW = 0.3; // pts: "the jump explains it" in both periods
export const FM_T = 3; // Harvey, Liu & Zhu (2016)

export function bandOf(move: number | null, cuts: readonly number[], floor: number | null): number | null {
  if (move === null) return null;
  if (floor !== null && move < floor - EPS) return null;
  let k = 0;
  while (k < cuts.length && move >= cuts[k]! - EPS) k++;
  return floor !== null ? k - 1 : k;
}

export function thirdCuts(values: number[]): [number, number] {
  const s = [...values].sort((a, b) => a - b);
  return [quantile(s, 1 / 3), quantile(s, 2 / 3)];
}
export function thirdOf(v: number, cuts: [number, number]): 0 | 1 | 2 {
  return v < cuts[0] ? 0 : v < cuts[1] ? 1 : 2;
}

export function groupKey(date: string, band: number, third: number, sector?: string): string {
  return `${date.slice(0, 7)}|${band}|${third}${sector ? `|${sector}` : ""}`;
}

/** Running sums for least squares: one day's fit without keeping its rows. */
export type NormalEq = { k: number; n: number; xx: number[][]; xy: number[] };
export function normalEq(k: number): NormalEq {
  return { k, n: 0, xx: Array.from({ length: k }, () => new Array<number>(k).fill(0)), xy: new Array<number>(k).fill(0) };
}
export function addRow(acc: NormalEq, x: number[], y: number): void {
  for (let i = 0; i < acc.k; i++) {
    for (let j = 0; j < acc.k; j++) acc.xx[i]![j]! += x[i]! * x[j]!;
    acc.xy[i]! += x[i]! * y;
  }
  acc.n++;
}
/** Gaussian elimination with partial pivoting; null if singular. */
export function solveEq(acc: NormalEq): number[] | null {
  const k = acc.k;
  const A = acc.xx.map((row, i) => [...row, acc.xy[i]!]);
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[p]![c]!)) p = r;
    if (Math.abs(A[p]![c]!) < 1e-12 * Math.max(1, Math.abs(A[c]![c]!))) return null;
    [A[c], A[p]] = [A[p]!, A[c]!];
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = A[r]![c]! / A[c]![c]!;
      for (let j = c; j <= k; j++) A[r]![j]! -= f * A[c]![j]!;
    }
  }
  const out = A.map((row, i) => row[k]! / row[i]!);
  return out.every(Number.isFinite) ? out : null;
}
/** Least squares by the normal equations; null if singular. */
export function ols(X: number[][], y: number[]): number[] | null {
  const acc = normalEq(X[0]?.length ?? 0);
  X.forEach((x, r) => addRow(acc, x, y[r]!));
  return acc.k ? solveEq(acc) : null;
}

/** Mean of a time series with a Newey–West (Bartlett) standard error; null if too short. */
export function neweyWest(series: number[], lags: number): { mean: number; se: number; t: number } | null {
  const n = series.length;
  if (n < Math.max(3, lags + 2)) return null;
  const mean = series.reduce((a, v) => a + v, 0) / n;
  const e = series.map((v) => v - mean);
  let s = e.reduce((a, v) => a + v * v, 0) / n;
  for (let L = 1; L <= lags; L++) {
    let c = 0;
    for (let t = L; t < n; t++) c += e[t]! * e[t - L]!;
    s += 2 * (1 - L / (lags + 1)) * (c / n);
  }
  const se = Math.sqrt(Math.max(s, 0) / n);
  return { mean, se, t: se > 0 ? mean / se : 0 };
}

export type Verdict5 = "Volume adds" | "The jump explains it" | "Not settled";

export function verdict5(o: { disc: Part; hold: Part; main: number; fmT: number | null; fmB: number | null; needFm: boolean }): Verdict5 {
  const eff = (p: Part) => (p.medians[o.main] == null || p.baseline[o.main] == null ? null : p.medians[o.main]! - p.baseline[o.main]!);
  const dE = eff(o.disc), hE = eff(o.hold), dl = o.disc.luck, hl = o.hold.luck;
  const same = sameWay(o.disc.medians, o.disc.baseline, o.main);
  const dir = dE === null ? 0 : Math.sign(dE);
  const matched = o.disc.n >= MIN_EPISODES && dl !== null && dl.strength >= 97.5 && dE !== null && Math.abs(dE) >= MIN_EFFECT &&
    dir === (dl.direction === "better" ? 1 : -1) && same >= 3 &&
    o.hold.n >= MIN_EPISODES && hl !== null && (dir > 0 ? hl.beat >= HOLDOUT_BAR : hl.beat <= 100 - HOLDOUT_BAR);
  const fm = !o.needFm || (o.fmT !== null && o.fmB !== null && Math.abs(o.fmT) >= FM_T && Math.sign(o.fmB) === dir);
  if (matched && fm) return "Volume adds";
  if (dE !== null && hE !== null && Math.abs(dE) < SETTLED_BELOW && Math.abs(hE) < SETTLED_BELOW) return "The jump explains it";
  return "Not settled";
}

/** Signal days left out because their group has no control day (pools indexed by group). */
export function droppedCount(occ: { day: number }[], pools: number[][]): number {
  return occ.filter((o) => (pools[o.day]?.length ?? 0) === 0).length;
}

type FlagInput = {
  dates: string[]; close: number[]; sma200: (number | null)[];
  volRatio: (number | null)[]; move: (number | null)[]; eligible: boolean[];
};

/** Q1: up day of at least +3%, on ≥ 5× volume (signal) or < 1.5× (control). Eligible days only. */
export function jumpFlags(s: FlagInput): { signal: boolean[]; control: boolean[] } {
  const signal = s.dates.map(() => false), control = s.dates.map(() => false);
  s.dates.forEach((_, i) => {
    const vr = s.volRatio[i], mv = s.move[i];
    if (!s.eligible[i] || vr == null || mv == null || mv < JUMP_FLOOR - EPS) return;
    signal[i] = vr >= HUGE_X - EPS;
    control[i] = vr < LIGHT - EPS;
  });
  return { signal, control };
}

/** Q2: close crosses above the 200-day SMA (crossFlags' rule), ≥ 2× (signal) or < 1.5× (control). */
export function breakoutFlags(s: FlagInput): { signal: boolean[]; control: boolean[] } {
  const seg = segmentIds(s.dates);
  const signal = s.dates.map(() => false), control = s.dates.map(() => false);
  for (let i = 1; i < s.dates.length; i++) {
    const a = s.sma200[i - 1], b = s.sma200[i], vr = s.volRatio[i];
    if (!s.eligible[i] || a == null || b == null || vr == null || seg[i - 1] !== seg[i]) continue;
    if (!(s.close[i - 1]! <= a && s.close[i]! > b)) continue;
    signal[i] = vr >= HEAVY - EPS;
    control[i] = vr < LIGHT - EPS;
  }
  return { signal, control };
}

/** Median turnover of the last WINDOW sessions including the day (same segment); the size measure. */
export function medianTurnover(turnover: number[], dates: string[]): (number | null)[] {
  const out: (number | null)[] = dates.map(() => null);
  for (const s of segmentByGaps(dates)) {
    s.forEach((i, j) => {
      if (j >= WINDOW - 1) out[i] = median(s.slice(j - WINDOW + 1, j + 1).map((k) => turnover[k]!));
    });
  }
  return out;
}

/** % return over the h sessions ending the day before (D−1−h → D−1), same segment; the reversal control. */
export function prevReturn(close: number[], dates: string[], h: number): (number | null)[] {
  const seg = segmentIds(dates);
  return close.map((_, i) => {
    const a = i - 1 - h, b = i - 1;
    return a >= 0 && seg[a] === seg[i] ? (close[b]! / close[a]! - 1) * 100 : null;
  });
}

/**
 * Null each signal's return at spans where its group has no control, so the
 * signal median and the matched baseline describe the same days at every span
 * (the baseline skips such signals; the median would otherwise keep them).
 */
export function alignToPools<T extends { day: number; returns: (number | null)[] }>(occ: T[], pools: number[][][]): T[] {
  return occ.map((o) => ({ ...o, returns: o.returns.map((r, v) => ((pools[v]?.[o.day]?.length ?? 0) > 0 ? r : null)) }));
}

/**
 * Side check (added after review): each signal gets its own pool, its group's
 * controls minus those from the same stock (a same-month light-volume repeat of
 * the same stock overlaps its returns). Signals left with no control are dropped.
 * `pool[g]` and `syms[g]` are parallel; returns the occasions re-indexed to their pools.
 */
export function excludeSelf<T extends { day: number; symbol: string }>(occ: T[], pool: number[][], syms: string[][]) {
  const pools: number[][] = [];
  const kept: T[] = [];
  for (const o of occ) {
    const own = (pool[o.day] ?? []).filter((_, k) => syms[o.day]![k] !== o.symbol);
    if (own.length === 0) continue;
    kept.push({ ...o, day: pools.length });
    pools.push(own);
  }
  return { occ: kept, pools, dropped: occ.length - kept.length };
}
