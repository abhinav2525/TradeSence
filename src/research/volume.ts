/**
 * Research 0002: does volume tell us anything on the NIFTY 50? Pure, tested
 * helpers; the runner is cli-volume.ts. Results: docs/research/0002-does-volume-predict.md.
 * Spec: docs/superpowers/specs/2026-10-03-volume-study-design.md.
 */
import { segmentByGaps } from "../indicators/gaps";
import type { History } from "../indicators/history";
import { segmentIds } from "../indicators/signals";

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
