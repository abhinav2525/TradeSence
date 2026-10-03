/**
 * Research 0002: does volume tell us anything on the NIFTY 50? Pure, tested
 * helpers; the runner is cli-volume.ts. Results: docs/research/0002-does-volume-predict.md.
 * Spec: docs/superpowers/specs/2026-10-03-volume-study-design.md.
 */
import { segmentByGaps } from "../indicators/gaps";
import type { History } from "../indicators/history";

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
