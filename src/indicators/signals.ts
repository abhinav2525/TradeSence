/**
 * The Signals page's maths (decision 0017): the breadth washout alarm and the
 * forward returns behind it. Pure, so every rule is tested without a database.
 * Episodes come from the same finder as research 0001 and the Report Card.
 * Spec: docs/superpowers/specs/2026-10-03-signals-washout-design.md.
 */
import { MERGE_GAP, findEpisodeSpans } from "./episodes";
import { segmentByGaps } from "./gaps";
import { NOISE_PCT } from "./risk";
import { BUCKETS, HORIZONS, bucketOf, type Bucket } from "../research/forward-returns";

export const WASHOUT_LINE = 20; // % of members above their 200-day SMA (research 0001)
export const STRONG_LINE = 80;
export const WATCH_BAND = 5; // points above the line that still read "Watching"
export const BUCKET_HORIZON = 63; // sessions: the bar chart's 3-month return
export const RECENT_SESSIONS = 60; // the detector card's sparkline

export type Status = "active" | "watching" | "quiet";
export type Condition = "under" | "over";
export type HorizonKey = (typeof HORIZONS)[number]["key"];

/** Strict, like isMaKind: anything else falls back to the default. */
export function isCondition(v: string | undefined): v is Condition {
  return v === "under" || v === "over";
}

const TESTS: Record<Condition, (p: number) => boolean> = {
  under: (p) => p < WASHOUT_LINE,
  over: (p) => p >= STRONG_LINE,
};

export function washoutStatus(pct: number): Status {
  if (pct < WASHOUT_LINE) return "active";
  if (pct <= WASHOUT_LINE + WATCH_BAND) return "watching";
  return "quiet";
}

/** One session with both readings: 200-day SMA breadth and the NIFTY 50 close. */
export type Day = { date: string; pct: number; close: number };

/** The segment each session belongs to; a hole over MAX_GAP_DAYS starts a new one. */
export function segmentIds(dates: string[]): number[] {
  const out = new Array<number>(dates.length);
  segmentByGaps(dates).forEach((seg, s) => {
    for (const i of seg) out[i] = s;
  });
  return out;
}

/** % change h sessions on; null if that session hasn't happened or the stretch spans a hole. */
export function forwardReturnSafe(closes: number[], seg: number[], i: number, h: number): number | null {
  const j = i + h;
  if (j >= closes.length || seg[j] !== seg[i]) return null;
  return (closes[j]! / closes[i]! - 1) * 100;
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length / 2;
  return s.length % 2 ? s[Math.floor(mid)]! : (s[mid - 1]! + s[mid]!) / 2;
}

export type Returns = Record<HorizonKey, number | null>;
export type Episode = {
  start: string;
  last: string;
  extreme: number; // lowest reading for "under", highest for "over"
  sessions: number; // qualifying sessions within the episode
  returns: Returns;
  pending: Record<HorizonKey, boolean>; // true: the horizon runs past the latest session
};

const nonNull = (v: number | null): v is number => v !== null;

function columns(days: Day[]) {
  return { pct: days.map((d) => d.pct), closes: days.map((d) => d.close), seg: segmentIds(days.map((d) => d.date)) };
}

/** Episodes oldest first, each with the NIFTY 50's return from its first session. */
export function episodesOf(days: Day[], cond: Condition): Episode[] {
  const { pct, closes, seg } = columns(days);
  return findEpisodeSpans(pct, TESTS[cond], MERGE_GAP).map((s) => {
    const span = pct.slice(s.start, s.last + 1);
    const returns = {} as Returns;
    const pending = {} as Record<HorizonKey, boolean>;
    for (const h of HORIZONS) {
      returns[h.key] = forwardReturnSafe(closes, seg, s.start, h.sessions);
      pending[h.key] = s.start + h.sessions >= days.length;
    }
    return {
      start: days[s.start]!.date,
      last: days[s.last]!.date,
      extreme: cond === "under" ? Math.min(...span) : Math.max(...span),
      sessions: s.sessions,
      returns,
      pending,
    };
  });
}

export type HorizonSummary = {
  key: HorizonKey;
  label: string;
  n: number; // episodes with this horizon behind them
  median: number | null;
  higher: number;
  best: number | null;
  worst: number | null;
  baseline: number | null; // median over every session: an ordinary day
};

export function summarizeHorizons(days: Day[], episodes: Episode[]): HorizonSummary[] {
  const { closes, seg } = columns(days);
  return HORIZONS.map((h) => {
    const vals = episodes.map((e) => e.returns[h.key]).filter(nonNull);
    const all = days.map((_, i) => forwardReturnSafe(closes, seg, i, h.sessions)).filter(nonNull);
    return {
      key: h.key,
      label: h.label,
      n: vals.length,
      median: median(vals),
      higher: vals.filter((v) => v > NOISE_PCT).length,
      best: vals.length ? Math.max(...vals) : null,
      worst: vals.length ? Math.min(...vals) : null,
      baseline: median(all),
    };
  });
}

export type BucketMedian = { bucket: Bucket; n: number; median: number | null };

/** Median h-session return by breadth bucket, counting every session (by day, not episode). */
export function bucketMedians(days: Day[], h = BUCKET_HORIZON): { buckets: BucketMedian[]; all: number | null } {
  const { closes, seg } = columns(days);
  const by = new Map<Bucket, number[]>(BUCKETS.map((b) => [b, []]));
  const all: number[] = [];
  days.forEach((d, i) => {
    const r = forwardReturnSafe(closes, seg, i, h);
    if (r === null) return;
    by.get(bucketOf(d.pct))!.push(r);
    all.push(r);
  });
  return {
    buckets: BUCKETS.map((b) => ({ bucket: b, n: by.get(b)!.length, median: median(by.get(b)!) })),
    all: median(all),
  };
}

export type Washout = {
  status: Status;
  pct: number;
  date: string; // the latest session
  since: string | null; // first day of the ongoing washout, when Active
  lastStart: string | null; // first day of the latest washout, ongoing or not
  fired: number; // washouts since the first session, including an ongoing one
};

export function washoutOf(days: Day[], under: Episode[]): Washout | null {
  const today = days.at(-1);
  if (!today) return null;
  const status = washoutStatus(today.pct);
  const latest = under.at(-1);
  return {
    status,
    pct: today.pct,
    date: today.date,
    since: status === "active" && latest ? latest.start : null,
    lastStart: latest?.start ?? null,
    fired: under.length,
  };
}

export type Signals = {
  first: string | null;
  washout: Washout | null;
  recent: { date: string; pct: number }[];
  episodes: Record<Condition, Episode[]>;
  horizons: Record<Condition, HorizonSummary[]>;
  buckets: { buckets: BucketMedian[]; all: number | null };
};

/** Everything the Signals page and the home notice need, from one joined series. */
export function buildSignals(days: Day[]): Signals {
  const under = episodesOf(days, "under");
  const over = episodesOf(days, "over");
  return {
    first: days[0]?.date ?? null,
    washout: washoutOf(days, under),
    recent: days.slice(-RECENT_SESSIONS).map((d) => ({ date: d.date, pct: d.pct })),
    episodes: { under, over },
    horizons: { under: summarizeHorizons(days, under), over: summarizeHorizons(days, over) },
    buckets: bucketMedians(days),
  };
}
