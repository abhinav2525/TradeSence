/**
 * Market-risk measures for the Report Card's lights 6–8 (decision 0014):
 * RiskMetrics volatility and its weekly range, capture and beta against the
 * NIFTY 50, and falls in market-crash episodes. All over the adjusted line, so
 * splits, demergers and renames can't fake a move.
 * Spec: docs/superpowers/specs/2026-10-02-report-card-three-lights-design.md.
 */
import { MERGE_GAP, findEpisodes } from "./episodes";
import { NOISE_PCT, type LinePoint, type MovePoint } from "./risk";

export const EWMA_LAMBDA = 0.94; // J.P. Morgan RiskMetrics (1996), daily data
export const EWMA_SEED = 20; // moves whose sample variance starts the average
export const WEEK = 5; // sessions
export const HIT_SESSIONS = 500; // about two years
export const HIT_MIN = 100;
export const CAPTURE_SESSIONS = 250;
export const CAPTURE_MIN = 120;

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/**
 * σ (% per day) after each session: σ²ₜ = λ·σ²ₜ₋₁ + (1 − λ)·r²ₜ. Null until a
 * segment has EWMA_SEED moves; restarts at every segment (a gap in the data).
 */
export function ewmaVolatility(line: LinePoint[], lambda = EWMA_LAMBDA): (number | null)[] {
  const out: (number | null)[] = [];
  let seg = -1;
  let seed: number[] = [];
  let v: number | null = null;
  for (let i = 0; i < line.length; i++) {
    const p = line[i]!;
    if (p.segment !== seg) {
      seg = p.segment; seed = []; v = null;
      out.push(null);
      continue;
    }
    const r = (p.level / line[i - 1]!.level - 1) * 100;
    if (v === null) {
      seed.push(r);
      if (seed.length === EWMA_SEED) {
        const m = mean(seed);
        v = seed.reduce((s, x) => s + (x - m) ** 2, 0) / (seed.length - 1);
      }
    } else {
      v = lambda * v + (1 - lambda) * r * r;
    }
    out.push(v === null ? null : Math.sqrt(v));
  }
  return out;
}

/**
 * How often a real week stayed inside ±σₜ·√5, judged with the σ known at the
 * week's start (no hindsight), over weeks starting in the last `sessions`.
 */
export function rangeHitRate(
  line: LinePoint[],
  sigma: (number | null)[],
  sessions = HIT_SESSIONS,
  min = HIT_MIN,
): { inside: number; of: number } | null {
  let inside = 0;
  let of = 0;
  for (let t = Math.max(0, line.length - sessions); t + WEEK < line.length; t++) {
    const s = sigma[t];
    if (s === null || s === undefined || line[t]!.segment !== line[t + WEEK]!.segment) continue;
    const move = Math.abs((line[t + WEEK]!.level / line[t]!.level - 1) * 100);
    of++;
    if (move <= s * Math.sqrt(WEEK) + NOISE_PCT) inside++;
  }
  return of < min ? null : { inside, of };
}

export type Capture = { beta: number; up: number; down: number; sessions: number };

/**
 * Over the last `sessions` days with both moves (matched by date): beta =
 * Cov ÷ Var, and the stock's average move on NIFTY up / down days as a % of
 * the NIFTY's. A flat NIFTY day (within noise) counts in neither capture.
 */
export function marketCapture(
  stock: MovePoint[],
  nifty: MovePoint[],
  sessions = CAPTURE_SESSIONS,
  min = CAPTURE_MIN,
): Capture | null {
  const byDate = new Map<string, number>();
  for (const n of nifty) if (n.changePct !== null) byDate.set(n.date, n.changePct);
  const pairs = stock
    .filter((s) => s.changePct !== null && byDate.has(s.date))
    .map((s) => ({ s: s.changePct!, m: byDate.get(s.date)! }))
    .slice(-sessions);
  if (pairs.length < min) return null;
  const ms = mean(pairs.map((p) => p.s));
  const mm = mean(pairs.map((p) => p.m));
  const cov = pairs.reduce((a, p) => a + (p.s - ms) * (p.m - mm), 0) / (pairs.length - 1);
  const varM = pairs.reduce((a, p) => a + (p.m - mm) ** 2, 0) / (pairs.length - 1);
  const up = pairs.filter((p) => p.m > NOISE_PCT);
  const down = pairs.filter((p) => p.m < -NOISE_PCT);
  if (varM === 0 || up.length === 0 || down.length === 0) return null;
  const ratio = (xs: typeof pairs) => (mean(xs.map((p) => p.s)) / mean(xs.map((p) => p.m))) * 100;
  return { beta: cov / varM, up: ratio(up), down: ratio(down), sessions: pairs.length };
}

export const CRASH_BREADTH = 20; // % of NIFTY 50 members above their 200-day SMA
export const CRASH_FALL_SESSIONS = 63; // 3 months
export const CRASH_BACK_SESSIONS = 126; // 6 months

export type CrashEpisode = { start: string; stockFall: number; niftyFall: number; back: boolean | null };
export type Crashes = {
  episodes: CrashEpisode[]; // oldest first
  ongoing: string | null; // the latest start with under 63 sessions since: mentioned, not counted
  medianStock: number | null;
  medianNifty: number | null;
  ratio: number | null; // median of each crash's stock ÷ NIFTY fall; null if the NIFTY fell in none
  backCount: number;
  backOf: number;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length / 2;
  return s.length % 2 ? s[Math.floor(mid)]! : (s[mid - 1]! + s[mid]!) / 2;
};

/**
 * The crash's fall on one line: from the highest level in the 63 sessions up to
 * the start to the lowest in the 63 after it, in % (≤ 0). Null without 63
 * sessions either side, or across a gap. Measured from the pre-crash high
 * because breadth usually breaks near the bottom: from the trigger day itself
 * the NIFTY's fall is near zero, and dividing by it paints noise red.
 */
function crashFall(line: LinePoint[], i: number | undefined): number | null {
  if (i === undefined) return null;
  const from = i - CRASH_FALL_SESSIONS, to = i + CRASH_FALL_SESSIONS;
  if (from < 0 || to > line.length - 1 || line[from]!.segment !== line[to]!.segment) return null;
  let peak = -Infinity, low = Infinity;
  for (let k = from; k <= i; k++) peak = Math.max(peak, line[k]!.level);
  for (let k = i; k <= to; k++) low = Math.min(low, line[k]!.level);
  return Math.min(0, (low / peak - 1) * 100);
}

function backAfter(line: LinePoint[], i: number): boolean | null {
  const end = i + CRASH_BACK_SESSIONS;
  if (end > line.length - 1 || line[end]!.segment !== line[i]!.segment) return null;
  return (line[end]!.level / line[i]!.level - 1) * 100 >= -NOISE_PCT;
}

/**
 * Each completed market crash (200-SMA breadth < 20%, research 0001's episodes,
 * then merged when their 3-month windows overlap, so one fall counts once):
 * the stock's and the NIFTY's fall from the pre-crash high, and whether the
 * stock was back 6 months on. The light is the median of each crash's own
 * stock ÷ NIFTY ratio. `breadth` must stop at the chosen date (no hindsight).
 */
export function crashEpisodes(
  breadth: { date: string; pctAbove: number }[],
  stock: LinePoint[],
  nifty: LinePoint[],
): Crashes {
  const found = findEpisodes(breadth.map((b) => b.pctAbove), (p) => p < CRASH_BREADTH, MERGE_GAP);
  const starts: number[] = [];
  for (const b of found) if (starts.length === 0 || b - starts.at(-1)! > CRASH_FALL_SESSIONS) starts.push(b);
  const sIdx = new Map(stock.map((p, i) => [p.date, i]));
  const nIdx = new Map(nifty.map((p, i) => [p.date, i]));
  const episodes: CrashEpisode[] = [];
  let ongoing: string | null = null;
  for (const b of starts) {
    const start = breadth[b]!.date;
    if (b + CRASH_FALL_SESSIONS > breadth.length - 1) { ongoing = start; continue; }
    const si = sIdx.get(start);
    const stockFall = crashFall(stock, si);
    const niftyFall = crashFall(nifty, nIdx.get(start));
    if (stockFall === null || niftyFall === null) continue;
    episodes.push({ start, stockFall, niftyFall, back: backAfter(stock, si!) });
  }
  const ratios = episodes.filter((e) => e.niftyFall < -NOISE_PCT).map((e) => e.stockFall / e.niftyFall);
  const known = episodes.filter((e) => e.back !== null);
  return {
    episodes,
    ongoing,
    medianStock: episodes.length ? median(episodes.map((e) => e.stockFall)) : null,
    medianNifty: episodes.length ? median(episodes.map((e) => e.niftyFall)) : null,
    ratio: ratios.length ? median(ratios) : null,
    backCount: known.filter((e) => e.back).length,
    backOf: known.length,
  };
}
