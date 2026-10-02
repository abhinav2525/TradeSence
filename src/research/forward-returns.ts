/**
 * Forward-return study: after a given breadth reading, what did the NIFTY 50
 * index do over the next 1 / 3 / 6 months? Pure helpers; the runner is
 * cli-forward-returns.ts. Results: docs/research/0001-does-breadth-predict.md.
 */

export const HORIZONS = [
  { key: "1m", label: "1 month", sessions: 21 },
  { key: "3m", label: "3 months", sessions: 63 },
  { key: "6m", label: "6 months", sessions: 126 },
] as const;

export const BUCKETS = ["<20", "20–40", "40–60", "60–80", "≥80"] as const;
export type Bucket = (typeof BUCKETS)[number];

export function bucketOf(pct: number): Bucket {
  if (pct < 20) return "<20";
  if (pct < 40) return "20–40";
  if (pct < 60) return "40–60";
  if (pct < 80) return "60–80";
  return "≥80";
}

/** % change from closes[i] to closes[i + h]; null when that day hasn't happened. */
export function forwardReturn(closes: number[], i: number, h: number): number | null {
  const later = closes[i + h];
  return later === undefined ? null : (later / closes[i]! - 1) * 100;
}

export type Summary = {
  n: number;
  mean: number | null;
  median: number | null;
  pctPositive: number | null;
  min: number | null;
  max: number | null;
};

export function summarize(values: number[]): Summary {
  if (values.length === 0) return { n: 0, mean: null, median: null, pctPositive: null, min: null, max: null };
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length / 2;
  return {
    n: s.length,
    mean: s.reduce((a, b) => a + b, 0) / s.length,
    median: s.length % 2 ? s[Math.floor(mid)]! : (s[mid - 1]! + s[mid]!) / 2,
    pctPositive: (s.filter((v) => v > 0).length / s.length) * 100,
    min: s[0]!,
    max: s[s.length - 1]!,
  };
}

/**
 * Start indices of episodes: runs of days meeting `test`. A run that resumes
 * within `mergeGap` days of the last qualifying day is the same episode.
 *
 * This is what keeps the study honest: 51 weak days in March 2020 are one
 * event, and counting them as 51 independent signals would overstate the
 * evidence fifty-fold.
 */
export function findEpisodes(pct: number[], test: (p: number) => boolean, mergeGap: number): number[] {
  const starts: number[] = [];
  let last = -Infinity;
  for (let i = 0; i < pct.length; i++) {
    if (!test(pct[i]!)) continue;
    if (i - last - 1 > mergeGap) starts.push(i);
    last = i;
  }
  return starts;
}
