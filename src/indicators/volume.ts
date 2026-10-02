/**
 * Volume against its own recent normal, for the Screener's "did volume back the
 * move?" question. See docs/decisions/0009-screener.md.
 */
import { segmentByGaps } from "./gaps";

export const VOLUME_WINDOW = 20;

/**
 * Each session's volume ÷ the mean of the `window` sessions before it (today is
 * never part of its own baseline). Null until a full window exists, after a
 * hole in the data (the baseline restarts), or when the baseline is zero.
 *
 * `shareFactors[i]` puts session i's volume in today's share units: a 1:5
 * split multiplies the share count by 5, so earlier volume is multiplied by 5
 * too. It must come from splits, bonuses and consolidations only. A demerger
 * leaves the share count alone, so it must not scale volume (decision 0008).
 */
export function volumeRatios(
  dates: string[],
  volumes: number[],
  shareFactors: number[],
  window = VOLUME_WINDOW,
): (number | null)[] {
  const out: (number | null)[] = new Array(volumes.length).fill(null);
  const adjusted = volumes.map((v, i) => v * shareFactors[i]!);

  for (const seg of segmentByGaps(dates)) {
    let sum = 0;
    for (let j = 0; j < seg.length; j++) {
      const i = seg[j]!;
      if (j >= window) {
        const base = sum / window;
        out[i] = base > 0 ? adjusted[i]! / base : null;
        sum -= adjusted[seg[j - window]!]!;
      }
      sum += adjusted[i]!;
    }
  }
  return out;
}
