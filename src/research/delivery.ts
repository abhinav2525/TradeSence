/**
 * Research 0003: does delivery % tell us anything? Pure, tested helpers; the
 * runner is cli-delivery.ts. Spec: docs/superpowers/specs/2026-10-04-delivery-study-design.md.
 */
import { segmentByGaps } from "../indicators/gaps";
import type { History } from "../indicators/history";
import { forwardReturnSafe, median, segmentIds } from "../indicators/signals";
import { NOISE_PCT } from "../indicators/risk";
import {
  DRAWS, HEAVY, LUCK_BAR, STUDY_HORIZONS, distinctMonths, episodeStarts, fifthCuts, fifthOf, mulberry32, sameWay,
  type Luck, type Verdict,
} from "./volume";

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
export const SIGNALS = [
  "Delivery well above its own normal",
  "Delivery well below its own normal",
  "Accumulation (high delivery, price up)",
  "Distribution (high delivery, price down)",
  "Delivery spike (≥ 2×), price up",
  "Delivery spike (≥ 2×), price down",
  "Long-term holders' stock (top fifth of delivery that day)",
  "Traders' stock (bottom fifth of delivery that day)",
] as const;

type Flaggable = Pick<StockSeries, "rel" | "spike" | "level" | "move" | "eligible" | "dates">;

/** The eight signals' flags, in SIGNALS order. Only eligible days can fire. */
export function signalFlags(s: Flaggable, relCuts: number[], levelCutsOf: (date: string) => number[] | undefined): boolean[][] {
  const out = SIGNALS.map(() => new Array<boolean>(s.dates.length).fill(false));
  s.dates.forEach((d, i) => {
    if (!s.eligible[i]) return;
    const rel = s.rel[i];
    const mv = s.move[i];
    const up = mv != null && mv > 0;
    const down = mv != null && mv < 0;
    const high = rel != null && fifthOf(rel, relCuts) === 4;
    out[0]![i] = high;
    out[1]![i] = rel != null && fifthOf(rel, relCuts) === 0;
    out[2]![i] = high && up;
    out[3]![i] = high && down;
    const sp = s.spike[i];
    out[4]![i] = sp != null && sp >= HEAVY && up;
    out[5]![i] = sp != null && sp >= HEAVY && down;
    const cuts = levelCutsOf(d);
    const lv = s.level[i];
    if (cuts && lv != null) {
      out[6]![i] = fifthOf(lv, cuts) === 4;
      out[7]![i] = fifthOf(lv, cuts) === 0;
    }
  });
  return out;
}

/** Fifth cut points of each date's values across stocks; dates with fewer than 5 values get none. */
export function levelCutsByDate(byDate: Map<string, number[]>): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const [d, v] of byDate) if (v.length >= 5) out.set(d, fifthCuts(v));
  return out;
}

export type Occasion = {
  date: string;
  day: number; // index into the study's list of trading days
  pos: number; // this stock's position in that day's main-span pool; −1 if not in it
  returns: (number | null)[]; // one per STUDY_HORIZONS
};

export function occasionsOf(
  flags: boolean[], s: Pick<StockSeries, "dates" | "returns">, dayOf: (date: string) => number, posOf: (i: number) => number,
): Occasion[] {
  return episodeStarts(flags).map((i) => ({
    date: s.dates[i]!, day: dayOf(s.dates[i]!), pos: posOf(i), returns: s.returns.map((r) => r[i] ?? null),
  }));
}
/**
 * Date-matched luck check (decision 0022). In each draw every occasion is
 * replaced by a random OTHER eligible stock on the same day; beat = % of draws
 * whose median is below the signal's (ties within NOISE_PCT count half).
 * Occasions without a main-span return, or on a day with no other stock, are left out.
 */
export function matchedLuck(signal: Occasion[], pools: number[][], main: number, draws = DRAWS, seed = 1): Luck | null {
  const usable = signal.filter((o) => {
    const r = o.returns[main];
    const size = pools[o.day]?.length ?? 0;
    return r != null && size - (o.pos >= 0 ? 1 : 0) >= 1;
  });
  if (usable.length === 0) return null;
  const target = median(usable.map((o) => o.returns[main]!))!;
  const rand = mulberry32(seed);
  const pick: number[] = new Array(usable.length);
  let below = 0;
  for (let d = 0; d < draws; d++) {
    usable.forEach((o, t) => {
      const pool = pools[o.day]!;
      const others = pool.length - (o.pos >= 0 ? 1 : 0);
      let k = Math.floor(rand() * others);
      if (o.pos >= 0 && k >= o.pos) k++; // skip the stock itself
      pick[t] = pool[k]!;
    });
    const m = median(pick)!;
    if (m < target - NOISE_PCT) below += 1;
    else if (Math.abs(m - target) <= NOISE_PCT) below += 0.5;
  }
  const beat = (below / draws) * 100;
  return { beat, direction: beat >= 50 ? "better" : "worse", strength: Math.max(beat, 100 - beat) };
}

/** Random picks per occasion for the baseline: 20 × thousands of occasions is plenty. */
export const BASELINE_REPS = 20;

/**
 * The luck check's yardstick, as one number: the median return of random
 * eligible stocks drawn from the occasions' own days (BASELINE_REPS picks per
 * occasion, seeded). Not "the median of each day's median": when some days
 * swing far more than others, that statistic drifts away from what a random
 * same-day stock does, and it contradicted the luck check on the first run
 * (research 0003, Method). The stock itself may be drawn (1 in ~1,000; negligible).
 */
export function matchedBaseline(occ: Occasion[], pools: number[][], h: number, reps = BASELINE_REPS, seed = 2): number | null {
  const usable = occ.filter((o) => o.returns[h] != null && (pools[o.day]?.length ?? 0) > 0);
  if (usable.length === 0) return null;
  const rand = mulberry32(seed);
  const picks: number[] = [];
  for (let r = 0; r < reps; r++) {
    for (const o of usable) {
      const pool = pools[o.day]!;
      picks.push(pool[Math.floor(rand() * pool.length)]!);
    }
  }
  return median(picks);
}

export type Part = {
  n: number; // occasions with a main-span return
  months: number;
  medians: (number | null)[];
  baseline: (number | null)[]; // matchedBaseline per span: a random stock on the same days
  luck: Luck | null;
};

export function part(occ: Occasion[], pools: number[][][], main: number): Part {
  const horizons = pools.length;
  const medians = Array.from({ length: horizons }, (_, h) =>
    median(occ.map((o) => o.returns[h]).filter((v): v is number => v != null)));
  const baseline = Array.from({ length: horizons }, (_, h) => matchedBaseline(occ, pools[h]!, h));
  const counted = occ.filter((o) => o.returns[main] != null);
  return {
    n: counted.length, months: distinctMonths(counted.map((o) => o.date)),
    medians, baseline, luck: matchedLuck(occ, pools[main]!, main),
  };
}

export type DeliveryResult = {
  name: string; discovery: Part; holdout: Part;
  same: number; // other spans on the main span's side of the baseline (discovery)
  effect: number | null; // discovery median − baseline at the main span, points
  verdict: Verdict;
};

export function deliveryVerdict(name: string, discovery: Part, holdout: Part, main: number): DeliveryResult {
  const same = sameWay(discovery.medians, discovery.baseline, main);
  const need = Math.min(3, discovery.medians.length - 1);
  const m = discovery.medians[main];
  const b = discovery.baseline[main];
  const effect = m == null || b == null ? null : m - b;
  const dl = discovery.luck;
  const hl = holdout.luck;
  const confirmed = hl !== null && dl !== null && holdout.n >= MIN_EPISODES &&
    (dl.direction === "better" ? hl.beat >= HOLDOUT_BAR : hl.beat <= 100 - HOLDOUT_BAR);
  const build = discovery.n >= MIN_EPISODES && dl !== null && dl.strength >= LUCK_BAR && same >= need &&
    effect !== null && Math.abs(effect) >= MIN_EFFECT && confirmed;
  const verdict: Verdict = build ? "Build" : same >= need ? "Maybe" : "Don't build";
  return { name, discovery, holdout, same, effect, verdict };
}
