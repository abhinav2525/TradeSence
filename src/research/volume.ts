/**
 * Research 0002: does volume tell us anything on the NIFTY 50? Pure, tested
 * helpers; the runner is cli-volume.ts. Results: docs/research/0002-does-volume-predict.md.
 * Spec: docs/superpowers/specs/2026-10-03-volume-study-design.md.
 */
import { segmentByGaps } from "../indicators/gaps";
import type { History } from "../indicators/history";
import { findEpisodeSpans, MERGE_GAP } from "../indicators/episodes";
import { forwardReturnSafe, median, segmentIds } from "../indicators/signals";
import { NOISE_PCT } from "../indicators/risk";

export const CMF_WINDOW = 20; // Chaikin's default
export const MFI_WINDOW = 14; // Quong & Soudack's default

export type Bars = { dates: string[]; high: number[]; low: number[]; close: number[]; volume: number[] };

/** Prices ÷ factor and volume × share factor, so splits and bonuses can't fake a move or a surge. */
export function adjustedBars(h: History): Bars {
  return {
    dates: h.dates,
    high: h.high.map((v, i) => v / h.factors[i]!),
    low: h.low.map((v, i) => v / h.factors[i]!),
    close: h.close.map((v, i) => v / h.factors[i]!),
    volume: h.volume.map((v, i) => v * h.shareFactors[i]!),
  };
}

/** Where the close sits in the day's range, from −1 (at the low) to +1 (at the high); 0 when high = low. */
function multiplier(b: Bars, i: number): number {
  const range = b.high[i]! - b.low[i]!;
  return range === 0 ? 0 : ((b.close[i]! - b.low[i]!) - (b.high[i]! - b.close[i]!)) / range;
}

/** Chaikin Money Flow: Σ(money-flow multiplier × volume) ÷ Σ volume over `window` sessions. */
export function cmf(b: Bars, window = CMF_WINDOW): (number | null)[] {
  const out: (number | null)[] = new Array(b.close.length).fill(null);
  for (const seg of segmentByGaps(b.dates)) {
    let flow = 0;
    let vol = 0;
    seg.forEach((i, j) => {
      flow += multiplier(b, i) * b.volume[i]!;
      vol += b.volume[i]!;
      if (j >= window) {
        const k = seg[j - window]!;
        flow -= multiplier(b, k) * b.volume[k]!;
        vol -= b.volume[k]!;
      }
      if (j >= window - 1) out[i] = vol > 0 ? flow / vol : null;
    });
  }
  return out;
}

/** Money Flow Index: 100 − 100 ÷ (1 + positive flow ÷ negative flow) over `window` flows. */
export function mfi(b: Bars, window = MFI_WINDOW): (number | null)[] {
  const out: (number | null)[] = new Array(b.close.length).fill(null);
  const tp = b.close.map((c, i) => (b.high[i]! + b.low[i]! + c) / 3);
  for (const seg of segmentByGaps(b.dates)) {
    const pos: number[] = [];
    const neg: number[] = [];
    for (let j = 1; j < seg.length; j++) {
      const i = seg[j]!;
      const prev = seg[j - 1]!;
      const flow = tp[i]! * b.volume[i]!;
      pos.push(tp[i]! > tp[prev]! ? flow : 0);
      neg.push(tp[i]! < tp[prev]! ? flow : 0);
      if (pos.length >= window) {
        const p = pos.slice(-window).reduce((s, x) => s + x, 0);
        const n = neg.slice(-window).reduce((s, x) => s + x, 0);
        out[i] = n === 0 ? (p > 0 ? 100 : 50) : 100 - 100 / (1 + p / n);
      }
    }
  }
  return out;
}

/** On-Balance Volume: from 0 at each segment start, + volume on an up close, − on a down close. */
export function obv(b: Bars): number[] {
  const out = new Array<number>(b.close.length).fill(0);
  for (const seg of segmentByGaps(b.dates)) {
    for (let j = 1; j < seg.length; j++) {
      const i = seg[j]!;
      const prev = seg[j - 1]!;
      const step = b.close[i]! > b.close[prev]! ? b.volume[i]! : b.close[i]! < b.close[prev]! ? -b.volume[i]! : 0;
      out[i] = out[prev]! + step;
    }
  }
  return out;
}

export const PANIC = 10; // ≤ 10% of traded value in rising stocks: a 90% down day
export const STAMPEDE = 90; // ≥ 90%: a 90% up day
export const SHARE_SMOOTH = 10;
export const OBV_LOOKBACK = 20;
export const HEAVY = 2; // vol_ratio: twice the 20-day normal
export const LIGHT = 1.5;
const PAIR_WINDOW = 10; // sessions from a panic day to its stampede day

/** % of the day's traded value (₹) that went into rising stocks; null when nothing moved. */
export function upShare(up: number, down: number): number | null {
  return up + down > 0 ? (up / (up + down)) * 100 : null;
}

/** Mean of the last `window` values within a segment; null if any of them is null. */
export function rollingMean(dates: string[], v: (number | null)[], window: number): (number | null)[] {
  const seg = segmentIds(dates);
  return v.map((_, i) => {
    if (i < window - 1 || seg[i - window + 1] !== seg[i]) return null;
    const w = v.slice(i - window + 1, i + 1);
    return w.some((x) => x === null) ? null : (w as number[]).reduce((s, x) => s + x, 0) / window;
  });
}

/** True on a stampede day that comes within 10 sessions after a panic day (same segment). */
export function panicThenStampede(dates: string[], share: (number | null)[]): boolean[] {
  const seg = segmentIds(dates);
  return share.map((s, i) => {
    if (s === null || s < STAMPEDE) return false;
    for (let j = Math.max(0, i - PAIR_WINDOW); j < i; j++) {
      const p = share[j];
      if (seg[j] === seg[i] && p !== null && p !== undefined && p <= PANIC) return true;
    }
    return false;
  });
}

/** Quiet buying: price down over `lookback` sessions while OBV rose. Quiet selling: the reverse. */
export function quietFlags(b: Bars, ob: number[], lookback = OBV_LOOKBACK): { buying: boolean[]; selling: boolean[] } {
  const seg = segmentIds(b.dates);
  const buying = new Array<boolean>(b.close.length).fill(false);
  const selling = new Array<boolean>(b.close.length).fill(false);
  for (let i = lookback; i < b.close.length; i++) {
    if (seg[i - lookback] !== seg[i]) continue;
    const price = b.close[i]! - b.close[i - lookback]!;
    const flow = ob[i]! - ob[i - lookback]!;
    buying[i] = price < 0 && flow > 0;
    selling[i] = price > 0 && flow < 0;
  }
  return { buying, selling };
}

/**
 * Crossings of an average (the Screener's rule: yesterday at or below, today
 * above, both averages present, no hole), split by the day's volume ratio.
 */
export function crossFlags(dates: string[], close: number[], ma: (number | null)[], volRatio: (number | null)[]) {
  const seg = segmentIds(dates);
  const n = close.length;
  const out = {
    aboveHeavy: new Array<boolean>(n).fill(false),
    aboveLight: new Array<boolean>(n).fill(false),
    belowHeavy: new Array<boolean>(n).fill(false),
    belowLight: new Array<boolean>(n).fill(false),
  };
  for (let i = 1; i < n; i++) {
    const a = ma[i - 1];
    const b = ma[i];
    const vr = volRatio[i];
    if (a == null || b == null || vr == null || seg[i - 1] !== seg[i]) continue;
    const up = close[i - 1]! <= a && close[i]! > b;
    const down = close[i - 1]! > a && close[i]! <= b;
    out.aboveHeavy[i] = up && vr >= HEAVY;
    out.aboveLight[i] = up && vr < LIGHT;
    out.belowHeavy[i] = down && vr >= HEAVY;
    out.belowLight[i] = down && vr < LIGHT;
  }
  return out;
}

export const STUDY_HORIZONS = [5, 10, 21, 63, 126] as const; // sessions: 1w, 2w, 1m, 3m, 6m
export const DRAWS = 1000;
export const LUCK_BAR = 97.5; // two-sided 95%: only 1 random pick in 20 is this unusual
export const MIN_MARKET = 8;
export const MIN_STOCK = 30;

export type Verdict = "Build" | "Maybe" | "Don't build";
export type Luck = { beat: number; direction: "better" | "worse"; strength: number };
export type Occasion = { date: string; returns: (number | null)[] }; // one per STUDY_HORIZONS
export type TestResult = {
  name: string;
  feeds: string; // which later project it would feed: A, B or C
  n: number; // occasions with a main-horizon return
  months: number; // distinct calendar months those occasions start in
  main: number; // index into STUDY_HORIZONS
  medians: (number | null)[];
  baseline: (number | null)[];
  luck: Luck | null;
  same: number; // other horizons on the main horizon's side of the baseline
  verdict: Verdict;
};

/** The stock's return minus the NIFTY 50's over the same sessions; null without both, or across a hole. */
export function excessReturn(
  close: number[], seg: number[], dates: string[], nifty: Map<string, number>, i: number, h: number,
): number | null {
  const r = forwardReturnSafe(close, seg, i, h);
  if (r === null) return null;
  const a = nifty.get(dates[i]!);
  const b = nifty.get(dates[i + h]!);
  return a === undefined || b === undefined ? null : r - (b / a - 1) * 100;
}

/** Linear-interpolated quantile of an ascending list. */
export function quantile(sorted: number[], p: number): number {
  const pos = p * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export function fifthCuts(values: number[]): number[] {
  const s = [...values].sort((a, b) => a - b);
  return [0.2, 0.4, 0.6, 0.8].map((p) => quantile(s, p));
}

/** 0 = bottom fifth … 4 = top fifth. */
export function fifthOf(v: number, cuts: number[]): number {
  let k = 0;
  while (k < cuts.length && v >= cuts[k]!) k++;
  return k;
}

/** True on days inside a membership window (added_on ≤ d < removed_on) and on or after `from`. */
export function memberFlags(dates: string[], windows: { addedOn: string; removedOn: string | null }[], from: string): boolean[] {
  return dates.map((d) => d >= from && windows.some((w) => d >= w.addedOn && (w.removedOn === null || d < w.removedOn)));
}

export function episodeStarts(flags: boolean[]): number[] {
  return findEpisodeSpans(flags.map((f) => (f ? 1 : 0)), (p) => p === 1, MERGE_GAP).map((s) => s.start);
}

/** A small seeded generator, so the luck check gives the same answer every run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * How unusual is the signal's median? Draw as many random days from `pool`
 * (without replacement) `draws` times; beat = % of draws whose median is below
 * the signal's (ties count half). Strength = the larger of beat and 100 − beat.
 */
export function luckCheck(signal: number[], pool: number[], draws = DRAWS, seed = 1): Luck | null {
  const k = signal.length;
  if (k === 0 || pool.length < k) return null;
  const target = median(signal)!;
  const rand = mulberry32(seed);
  const arr = pool.slice();
  let below = 0;
  for (let d = 0; d < draws; d++) {
    for (let t = 0; t < k; t++) {
      const r = t + Math.floor(rand() * (arr.length - t));
      [arr[t], arr[r]] = [arr[r]!, arr[t]!];
    }
    const m = median(arr.slice(0, k))!;
    if (m < target - NOISE_PCT) below += 1;
    else if (Math.abs(m - target) <= NOISE_PCT) below += 0.5;
  }
  const beat = (below / draws) * 100;
  return { beat, direction: beat >= 50 ? "better" : "worse", strength: Math.max(beat, 100 - beat) };
}

/** How many of the other horizons sit on the same side of the baseline as the main one. */
export function sameWay(medians: (number | null)[], baseline: (number | null)[], main: number): number {
  const side = (i: number) => {
    const m = medians[i];
    const b = baseline[i];
    if (m == null || b == null) return 0;
    const d = m - b;
    return d > NOISE_PCT ? 1 : d < -NOISE_PCT ? -1 : 0;
  };
  const s = side(main);
  if (s === 0) return 0;
  return medians.filter((_, i) => i !== main && side(i) === s).length;
}

export function verdictOf(n: number, min: number, luck: Luck | null, same: number): Verdict {
  if (n >= min && luck !== null && luck.strength >= LUCK_BAR && same >= 3) return "Build";
  if (same >= 3) return "Maybe";
  return "Don't build";
}

export function distinctMonths(dates: string[]): number {
  return new Set(dates.map((d) => d.slice(0, 7))).size;
}

/** One test's full result. `pool[h]` holds every eligible day's return at horizon h. */
export function judge(name: string, feeds: string, occasions: Occasion[], pool: number[][], main: number, min: number): TestResult {
  const at = (h: number) => occasions.map((o) => o.returns[h]).filter((v): v is number => v != null);
  const medians = STUDY_HORIZONS.map((_, h) => median(at(h)));
  const baseline = STUDY_HORIZONS.map((_, h) => median(pool[h] ?? []));
  const mainVals = at(main);
  const luck = luckCheck(mainVals, pool[main] ?? []);
  const same = sameWay(medians, baseline, main);
  const counted = occasions.filter((o) => o.returns[main] != null);
  return {
    name, feeds, main, medians, baseline, luck, same,
    n: mainVals.length,
    months: distinctMonths(counted.map((o) => o.date)),
    verdict: verdictOf(mainVals.length, min, luck, same),
  };
}
