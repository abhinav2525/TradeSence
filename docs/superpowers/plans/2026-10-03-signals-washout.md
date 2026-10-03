# Signals page: breadth washout alarm — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/signals` page showing the 200-SMA breadth washout alarm (Active / Watching / Quiet) with its full history and forward returns, plus a one-line notice on the home page while it is Active.

**Architecture:** Pure maths in `src/indicators/signals.ts` (built on a span-returning version of the shared episode finder), a thin query `src/query/signals.ts` that joins 200-SMA breadth to NIFTY 50 closes, plain-language copy in `src/components/signals-copy.ts`, and server-rendered cards on `/signals`. Computed on every page view; no new table, no nightly step.

**Tech Stack:** Next.js 16 (app router, server components), Bun test, Drizzle + Postgres, Recharts 2.15, Tailwind v4 tokens, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-03-signals-washout-design.md`

## Global Constraints

- 200-day SMA only on `/signals`; no average tabs. `ma` is carried only for the nav and validated with the strict `isMaKind`.
- `cond` param: exactly `"under"` or `"over"`, anything else → `"under"`.
- Washout line 20 (`< 20` is under); strong line 80 (`>= 80`); Watching band: `20 <= p <= 25`.
- Episode merge window: `MERGE_GAP` = 10 sessions, from `src/indicators/episodes.ts` (one rule for research 0001, the Report Card and Signals).
- Horizons: `HORIZONS` from `src/research/forward-returns.ts` (21 / 63 / 126 sessions); bar chart uses 63.
- "Higher" means `> NOISE_PCT` (`src/indicators/risk.ts`); never compare returns for exact equality.
- A forward return never spans a hole (`segmentByGaps`, `src/indicators/gaps.ts`).
- NIFTY 50 index name in `index_prices`: `"Nifty 50"`.
- Copy: true minus "−" (use `signed()`), dates via `formatDate` ("1 Oct 2026"), `up`/`down` colours only with a sign.
- Charts spread `useChartAnimation()`; never a literal `isAnimationActive`. A segmented switch has exactly one `<SlidingPill>`.
- Every new term gets a glossary entry; never put `<Term>` inside a `<Link>`.
- Tests run with `bun test` (always against `tradesence_test`); typecheck with `bunx tsc --noEmit`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Breadth exactly 20%:** reads Watching, not Active, on both the page and the home notice (tests in Task 2 and Task 3).
2. **An episode too recent for a horizon:** shows "Not yet" (not "—"), and is left out of "k of n" (test in Task 2).
3. **Junk `?cond=`** (`OVER`, `over'--`, empty): falls back to Under 20% (test in Task 2).
4. **Home page on a past date** (`/?date=2025-03-03`): no notice about today's washout (test in Task 3).
5. **Empty database or no index closes:** `/signals` shows "Nothing loaded", glossary live examples return null, nothing throws (tests in Task 4 and Task 6).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/indicators/episodes.ts` (modify) | Add `findEpisodeSpans`; `findEpisodes` derives from it |
| `src/indicators/signals.ts` (create) | All Signals maths: status, safe forward returns, episodes with returns, summaries, buckets, `buildSignals` |
| `src/components/signals-copy.ts` (create) | Pure sentence builders and small formatting helpers for the cards and the notice |
| `src/query/signals.ts` (create) | `signalsData()`: load breadth + closes, join, `buildSignals` |
| `src/components/hotkey-target.ts`, `SiteNav.tsx`, `Hotkeys.tsx` (modify) | `signals` section, Research group, key `g` |
| `src/lib/glossary.ts`, `src/query/glossary-live.ts` (modify) | Terms `washout`, `episode`, `forward-return` + live examples |
| `src/components/WashoutSpark.tsx`, `WashoutCard.tsx`, `ReturnBuckets.tsx`, `ForwardReturns.tsx`, `EpisodeTable.tsx` (create) | The page's cards and charts |
| `src/app/signals/page.tsx` (create) | The page |
| `src/components/WashoutNotice.tsx` (create), `src/app/page.tsx` (modify) | Home-page notice |
| Docs | Decision 0017, research 0001 refresh, README, CLAUDE.md, TODO |

---

### Task 1: Episode spans in the shared finder

**Files:**
- Modify: `src/indicators/episodes.ts`
- Test: `tests/episodes.test.ts` (create)

**Interfaces:**
- Produces: `export type EpisodeSpan = { start: number; last: number; sessions: number }` and `export function findEpisodeSpans(pct: number[], test: (p: number) => boolean, mergeGap: number): EpisodeSpan[]`. `findEpisodes` keeps its exact signature and output.

- [ ] **Step 1: Write the failing test**

Create `tests/episodes.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import { findEpisodeSpans, findEpisodes, MERGE_GAP } from "../src/indicators/episodes";

const under = (p: number) => p < 20;

describe("findEpisodeSpans", () => {
  test("a span records its first and last qualifying index and how many qualified", () => {
    // 0:50 1:15 2:12 3:30 4:18, then 12 days at 50, then 17:10
    const pct = [50, 15, 12, 30, 18, ...Array(12).fill(50), 10];
    expect(findEpisodeSpans(pct, under, MERGE_GAP)).toEqual([
      { start: 1, last: 4, sessions: 3 },
      { start: 17, last: 17, sessions: 1 },
    ]);
  });

  test("10 sessions between qualifying days merge; 11 split", () => {
    const merged = [10, ...Array(10).fill(50), 10];
    const split = [10, ...Array(11).fill(50), 10];
    expect(findEpisodeSpans(merged, under, MERGE_GAP)).toEqual([{ start: 0, last: 11, sessions: 2 }]);
    expect(findEpisodeSpans(split, under, MERGE_GAP).map((s) => s.start)).toEqual([0, 12]);
  });

  test("findEpisodes is exactly the span starts", () => {
    const pct = [50, 15, 12, 50, 50, 18, 50, 50, 50, 50, 10];
    for (const gap of [0, 3, MERGE_GAP]) {
      expect(findEpisodes(pct, under, gap)).toEqual(findEpisodeSpans(pct, under, gap).map((s) => s.start));
    }
  });

  test("nothing qualifies: no spans", () => {
    expect(findEpisodeSpans([50, 60], under, MERGE_GAP)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/episodes.test.ts`
Expected: FAIL, `findEpisodeSpans` is not exported.

- [ ] **Step 3: Implement**

In `src/indicators/episodes.ts`, replace the body of the file after `MERGE_GAP` with:

```ts
/** One episode, as indices into the series: first and last qualifying day, and how many qualified. */
export type EpisodeSpan = { start: number; last: number; sessions: number };

/**
 * Episodes in a series: runs of days meeting `test`. A run that resumes
 * within `mergeGap` days of the last qualifying day is the same episode.
 *
 * This is what keeps the study honest: 51 weak days in March 2020 are one
 * event, and counting them as 51 independent signals would overstate the
 * evidence fifty-fold.
 */
export function findEpisodeSpans(pct: number[], test: (p: number) => boolean, mergeGap: number): EpisodeSpan[] {
  const spans: EpisodeSpan[] = [];
  let last = -Infinity;
  for (let i = 0; i < pct.length; i++) {
    if (!test(pct[i]!)) continue;
    if (i - last - 1 > mergeGap) spans.push({ start: i, last: i, sessions: 1 });
    else {
      const s = spans.at(-1)!;
      s.last = i;
      s.sessions++;
    }
    last = i;
  }
  return spans;
}

/** Start indices of episodes (research 0001, the Report Card's crash light). */
export function findEpisodes(pct: number[], test: (p: number) => boolean, mergeGap: number): number[] {
  return findEpisodeSpans(pct, test, mergeGap).map((s) => s.start);
}
```

Also update the file's top comment to: `Episodes in a daily series: shared by research 0001, the Report Card's "In crashes" light and the Signals page, so they can never count episodes differently.`

- [ ] **Step 4: Run tests**

Run: `bun test tests/episodes.test.ts tests/forward-returns.test.ts tests/market-risk.test.ts`
Expected: all PASS (the last two prove the refactor moved nothing).

- [ ] **Step 5: Commit**

```bash
git add src/indicators/episodes.ts tests/episodes.test.ts
git commit -m "Episode finder returns spans (start, last, sessions); findEpisodes unchanged

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Signals maths

**Files:**
- Create: `src/indicators/signals.ts`
- Test: `tests/signals.test.ts` (create)

**Interfaces:**
- Consumes: `findEpisodeSpans`, `MERGE_GAP` (Task 1); `segmentByGaps` (`gaps.ts`); `NOISE_PCT` (`risk.ts`); `HORIZONS`, `BUCKETS`, `bucketOf`, `Bucket` (`src/research/forward-returns.ts`).
- Produces (exact names used by Tasks 3–8):
  - constants `WASHOUT_LINE = 20`, `STRONG_LINE = 80`, `WATCH_BAND = 5`, `BUCKET_HORIZON = 63`, `RECENT_SESSIONS = 60`
  - types `Status = "active" | "watching" | "quiet"`, `Condition = "under" | "over"`, `HorizonKey = "1m" | "3m" | "6m"`, `Day = { date: string; pct: number; close: number }`, `Returns = Record<HorizonKey, number | null>`, `Episode = { start: string; last: string; extreme: number; sessions: number; returns: Returns; pending: Record<HorizonKey, boolean> }`, `HorizonSummary = { key: HorizonKey; label: string; n: number; median: number | null; higher: number; best: number | null; worst: number | null; baseline: number | null }`, `BucketMedian = { bucket: Bucket; n: number; median: number | null }`, `Washout = { status: Status; pct: number; date: string; since: string | null; lastStart: string | null; fired: number }`, `Signals = { first: string | null; washout: Washout | null; recent: { date: string; pct: number }[]; episodes: Record<Condition, Episode[]>; horizons: Record<Condition, HorizonSummary[]>; buckets: { buckets: BucketMedian[]; all: number | null } }`
  - functions `isCondition(v: string | undefined): v is Condition`, `washoutStatus(pct: number): Status`, `segmentIds(dates: string[]): number[]`, `forwardReturnSafe(closes: number[], seg: number[], i: number, h: number): number | null`, `median(xs: number[]): number | null`, `episodesOf(days: Day[], cond: Condition): Episode[]`, `summarizeHorizons(days: Day[], episodes: Episode[]): HorizonSummary[]`, `bucketMedians(days: Day[], h?: number): { buckets: BucketMedian[]; all: number | null }`, `washoutOf(days: Day[], under: Episode[]): Washout | null`, `buildSignals(days: Day[]): Signals`

- [ ] **Step 1: Write the failing tests**

Create `tests/signals.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import {
  bucketMedians, buildSignals, episodesOf, forwardReturnSafe, isCondition, median,
  segmentIds, summarizeHorizons, washoutStatus, type Day,
} from "../src/indicators/signals";

const day = (i: number) => {
  const d = new Date(Date.UTC(2020, 0, 1));
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
};
const mk = (pcts: number[], closes?: (i: number) => number): Day[] =>
  pcts.map((pct, i) => ({ date: day(i), pct, close: closes ? closes(i) : 100 }));

describe("washoutStatus", () => {
  test("under 20 is Active; 20 to 25 inclusive is Watching; above 25 is Quiet", () => {
    expect(washoutStatus(19.99)).toBe("active");
    expect(washoutStatus(20)).toBe("watching");
    expect(washoutStatus(25)).toBe("watching");
    expect(washoutStatus(25.01)).toBe("quiet");
  });
});

describe("isCondition", () => {
  test("accepts exactly under and over", () => {
    expect(isCondition("under")).toBe(true);
    expect(isCondition("over")).toBe(true);
    for (const v of ["OVER", "over'--", "", " under", undefined]) expect(isCondition(v)).toBe(false);
  });
});

describe("forwardReturnSafe", () => {
  test("is the % change h sessions on", () => {
    expect(forwardReturnSafe([100, 110, 121], [0, 0, 0], 0, 2)).toBeCloseTo(21, 9);
  });
  test("is null past the last session", () => {
    expect(forwardReturnSafe([100, 110, 121], [0, 0, 0], 1, 2)).toBeNull();
  });
  test("is null across a hole in the data", () => {
    expect(forwardReturnSafe([100, 110, 121], [0, 0, 1], 0, 2)).toBeNull();
  });
});

test("segmentIds numbers each session's segment, splitting at a hole over 21 days", () => {
  expect(segmentIds(["2020-01-01", "2020-01-02", "2020-03-01"])).toEqual([0, 0, 1]);
});

test("median of odd, even and empty lists", () => {
  expect(median([3, 1, 2])).toBe(2);
  expect(median([4, 1, 3, 2])).toBe(2.5);
  expect(median([])).toBeNull();
});

describe("episodesOf", () => {
  const pcts = [50, 15, 12, 30, 18, ...Array(12).fill(50), 10];

  test("under 20%: dates, lowest reading and sessions under", () => {
    const eps = episodesOf(mk(pcts), "under");
    expect(eps.map((e) => [e.start, e.last, e.extreme, e.sessions])).toEqual([
      [day(1), day(4), 12, 3],
      [day(17), day(17), 10, 1],
    ]);
  });

  test("over 80%: the highest reading", () => {
    const eps = episodesOf(mk([50, 85, 92, 81, 50]), "over");
    expect(eps).toHaveLength(1);
    expect(eps[0]!.extreme).toBe(92);
  });

  test("a horizon past the latest session is null and pending; one inside is a number", () => {
    const days = mk([10, ...Array(29).fill(50)], (i) => (i === 0 ? 100 : 110));
    const [e] = episodesOf(days, "under");
    expect(e!.returns["1m"]).toBeCloseTo(10, 9);
    expect(e!.pending["1m"]).toBe(false);
    expect(e!.returns["3m"]).toBeNull();
    expect(e!.pending["3m"]).toBe(true);
  });

  test("a horizon across a data hole is null but not pending", () => {
    const days = mk([10, ...Array(29).fill(50)]);
    for (let i = 5; i < days.length; i++) days[i]!.date = day(i + 60); // a 60-day hole after day 4
    const [e] = episodesOf(days, "under");
    expect(e!.returns["1m"]).toBeNull();
    expect(e!.pending["1m"]).toBe(false);
  });
});

describe("summarizeHorizons", () => {
  test("a flat 0% is not counted as higher", () => {
    const days = mk([10, ...Array(129).fill(50)]);
    const [one] = summarizeHorizons(days, episodesOf(days, "under"));
    expect(one).toMatchObject({ key: "1m", n: 1, median: 0, higher: 0, best: 0, worst: 0, baseline: 0 });
  });

  test("episodes without the horizon behind them are left out; baseline is the median of every session", () => {
    const pcts = [10, ...Array(129).fill(50)];
    pcts[120] = 10; // a second, recent episode: no 1-month return yet
    const days = mk(pcts, (i) => (i === 0 ? 100 : 110));
    const hs = summarizeHorizons(days, episodesOf(days, "under"));
    for (const h of hs) {
      expect(h.n).toBe(1);
      expect(h.higher).toBe(1);
      expect(h.median).toBeCloseTo(10, 9);
      expect(h.baseline).toBe(0); // only the first session rose
    }
  });
});

test("bucketMedians: median return per breadth bucket and over all sessions", () => {
  const days = mk([10, 30, 50, 70, 90, 10], (i) => [100, 110, 121, 121, 100, 100][i]!);
  const { buckets, all } = bucketMedians(days, 1);
  expect(buckets.map((b) => b.bucket)).toEqual(["<20", "20–40", "40–60", "60–80", "≥80"]);
  expect(buckets[0]).toMatchObject({ n: 1 });
  expect(buckets[0]!.median).toBeCloseTo(10, 9); // the last session has no return yet
  expect(buckets[2]!.median).toBeCloseTo(0, 9);
  expect(buckets[3]!.median).toBeCloseTo((100 / 121 - 1) * 100, 9);
  expect(all).toBeCloseTo(0, 9);
});

describe("buildSignals", () => {
  test("an ongoing washout: Active, since its first day, counted in fired", () => {
    const pcts = [...Array(30).fill(50), 18, 16, 16];
    const s = buildSignals(mk(pcts));
    expect(s.washout).toEqual({ status: "active", pct: 16, date: day(32), since: day(30), lastStart: day(30), fired: 1 });
    expect(s.first).toBe(day(0));
    expect(s.recent).toHaveLength(33);
    expect(s.episodes.under).toHaveLength(1);
    expect(s.episodes.over).toHaveLength(0);
  });

  test("recent keeps the last 60 sessions", () => {
    expect(buildSignals(mk(Array(100).fill(50))).recent).toHaveLength(60);
  });

  test("no sessions: nothing to show", () => {
    const s = buildSignals([]);
    expect(s.washout).toBeNull();
    expect(s.first).toBeNull();
    expect(s.episodes.under).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/signals.test.ts`
Expected: FAIL, cannot find module `../src/indicators/signals`.

- [ ] **Step 3: Implement**

Create `src/indicators/signals.ts`:

```ts
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
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/signals.test.ts && bunx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/indicators/signals.ts tests/signals.test.ts
git commit -m "Signals maths: washout status, gap-safe forward returns, episodes and summaries

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Plain-language copy

**Files:**
- Create: `src/components/signals-copy.ts`
- Test: `tests/signals-copy.test.ts` (create)

**Interfaces:**
- Consumes: types and `WASHOUT_LINE` from Task 2; `formatDate`, `signed` (`src/lib/format.ts`); `NOISE_PCT`.
- Produces: `STATUS_LABEL: Record<Status, string>`, `pctText(v: number | null): string`, `toneClass(v: number | null): string`, `washoutSentence(w: Washout): string`, `firedLine(w: Washout, first: string): string`, `readingSentence(cond: Condition, hs: HorizonSummary[], episodes: Episode[]): string`, `noticeText(six: HorizonSummary): string`, `noticeVisible(status: Status | undefined, shown: string | null, latest: string | undefined): boolean`.

- [ ] **Step 1: Write the failing tests**

Create `tests/signals-copy.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import {
  firedLine, noticeText, noticeVisible, pctText, readingSentence, toneClass, washoutSentence,
} from "../src/components/signals-copy";
import type { Episode, HorizonSummary, Washout } from "../src/indicators/signals";

const w = (over: Partial<Washout>): Washout =>
  ({ status: "active", pct: 16, date: "2026-10-01", since: "2026-10-01", lastStart: "2026-10-01", fired: 6, ...over });
const h = (key: "1m" | "3m" | "6m", over: Partial<HorizonSummary>): HorizonSummary =>
  ({ key, label: key, n: 5, median: 5, higher: 5, best: 9, worst: 1, baseline: 1, ...over });
const ep = (start: string, oneMonth: number | null): Episode => ({
  start, last: start, extreme: 18, sessions: 1,
  returns: { "1m": oneMonth, "3m": 5, "6m": 10 },
  pending: { "1m": oneMonth === null, "3m": false, "6m": false },
});

describe("washoutSentence", () => {
  test("Active names the start", () => {
    expect(washoutSentence(w({}))).toBe("16% of NIFTY 50 stocks are above their 200-day SMA, under the 20% line. This washout began on 1 Oct 2026.");
  });
  test("Watching says how far above the line; exactly on it is not under it", () => {
    expect(washoutSentence(w({ status: "watching", pct: 22, since: null }))).toBe("22% of NIFTY 50 stocks are above their 200-day SMA, 2 pts above the 20% line.");
    expect(washoutSentence(w({ status: "watching", pct: 20, since: null }))).toBe("20% of NIFTY 50 stocks are above their 200-day SMA, right on the 20% line but not under it.");
  });
  test("Quiet", () => {
    expect(washoutSentence(w({ status: "quiet", pct: 48, since: null }))).toBe("48% of NIFTY 50 stocks are above their 200-day SMA, well clear of the 20% line.");
  });
});

describe("firedLine", () => {
  test("active, past and never", () => {
    expect(firedLine(w({}), "2020-01-01")).toBe("Fired 6 times since 2020 · this one began 1 Oct 2026");
    expect(firedLine(w({ status: "quiet", since: null, lastStart: "2025-04-07", fired: 1 }), "2020-01-01")).toBe("Fired once since 2020 · last began 7 Apr 2025");
    expect(firedLine(w({ status: "quiet", since: null, lastStart: null, fired: 0 }), "2020-01-01")).toBe("Hasn't fired since 1 Jan 2020");
  });
});

describe("readingSentence", () => {
  const hs = [h("1m", { median: 4.5, higher: 4 }), h("3m", { median: 10.9, baseline: 3.4 }), h("6m", { median: 13.6, baseline: 7.7 })];
  const eps = [ep("2020-03-09", -13.9), ep("2022-05-12", 2.5), ep("2022-06-16", 4.5), ep("2025-02-24", 4.6), ep("2025-04-07", 12.5), ep("2026-10-01", null)];

  test("under 20%: six-month record, beat, first-month losses by date, sample size", () => {
    expect(readingSentence("under", hs, eps)).toBe(
      "Every washout with six months behind it was higher six months on, and the median beat an ordinary day at every horizon. The first month was lower once (9 Mar 2020). Only 5 washouts so far: a small sample.",
    );
  });
  test("under 20%: not all higher, not beating", () => {
    const mixed = [h("1m", { median: 0.5, baseline: 1 }), h("3m", {}), h("6m", { higher: 3 })];
    expect(readingSentence("under", mixed, eps.slice(1, 5))).toBe(
      "3 of 5 washouts were higher six months on. The first month was higher every time. Only 5 washouts so far: a small sample.",
    );
  });
  test("over 80%: says it is not an alarm", () => {
    const o = [h("1m", { n: 8 }), h("3m", { n: 8 }), h("6m", { n: 8, higher: 4, median: -0.4, baseline: 7.7 })];
    expect(readingSentence("over", o, [])).toBe(
      "Six months after breadth went over 80%, the index was higher in 4 of 8, a median of −0.4% against +7.7% on an ordinary day. Research 0001 found no edge here, so it is not an alarm. Only 8 over-80% episodes so far: a small sample.",
    );
  });
  test("nothing has played out yet", () => {
    expect(readingSentence("under", [h("1m", { n: 0 }), h("3m", { n: 0 }), h("6m", { n: 0 })], [])).toBe("No washout has had a month to play out yet.");
  });
});

describe("home notice", () => {
  test("text uses the live counts", () => {
    expect(noticeText(h("6m", { n: 5, higher: 5 }))).toBe("under 20% of NIFTY 50 stocks are above their 200-day SMA. After each of the last 5 washouts, the index was higher 6 months later.");
    expect(noticeText(h("6m", { n: 6, higher: 5 }))).toBe("under 20% of NIFTY 50 stocks are above their 200-day SMA. After 5 of the last 6 washouts, the index was higher 6 months later.");
    expect(noticeText(h("6m", { n: 0, higher: 0 }))).toBe("under 20% of NIFTY 50 stocks are above their 200-day SMA.");
  });
  test("visible only when Active and showing the latest session", () => {
    expect(noticeVisible("active", "2026-10-01", "2026-10-01")).toBe(true);
    expect(noticeVisible("active", "2025-03-03", "2026-10-01")).toBe(false); // a past date
    expect(noticeVisible("watching", "2026-10-01", "2026-10-01")).toBe(false); // exactly 20%
    expect(noticeVisible(undefined, null, undefined)).toBe(false);
  });
});

test("pctText and toneClass", () => {
  expect(pctText(14.12)).toBe("+14.1%");
  expect(pctText(-6.1)).toBe("−6.1%");
  expect(pctText(null)).toBe("—");
  expect(toneClass(2)).toBe("text-up");
  expect(toneClass(-2)).toBe("text-down");
  expect(toneClass(0.01)).toBe("text-foreground-2");
  expect(toneClass(null)).toBe("text-foreground-2");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/signals-copy.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `src/components/signals-copy.ts` (relative imports, like `hotkey-target.ts`, so tests resolve them):

```ts
/**
 * Every sentence on the Signals page and in the home-page notice, built from
 * live numbers (decision 0017). Pure, so the wording is tested.
 */
import { formatDate, signed } from "../lib/format";
import { NOISE_PCT } from "../indicators/risk";
import {
  WASHOUT_LINE, type Condition, type Episode, type HorizonSummary, type Status, type Washout,
} from "../indicators/signals";

export const STATUS_LABEL: Record<Status, string> = { active: "Active", watching: "Watching", quiet: "Quiet" };

/** "+14.1%", "−6.1%", "—". */
export function pctText(v: number | null): string {
  return v === null ? "—" : `${signed(v, 1)}%`;
}

/** Colour for a signed figure; one that rounds to 0.0 stays neutral. */
export function toneClass(v: number | null): string {
  if (v === null || Math.abs(v) < 0.05) return "text-foreground-2";
  return v > 0 ? "text-up" : "text-down";
}

const times = (n: number) => (n === 1 ? "once" : `${n} times`);

export function washoutSentence(w: Washout): string {
  const lead = `${Math.round(w.pct)}% of NIFTY 50 stocks are above their 200-day SMA`;
  if (w.status === "active") return `${lead}, under the ${WASHOUT_LINE}% line. This washout began on ${formatDate(w.since)}.`;
  if (w.status === "watching") {
    const gap = Math.round(w.pct - WASHOUT_LINE);
    return gap === 0
      ? `${lead}, right on the ${WASHOUT_LINE}% line but not under it.`
      : `${lead}, ${gap} pts above the ${WASHOUT_LINE}% line.`;
  }
  return `${lead}, well clear of the ${WASHOUT_LINE}% line.`;
}

export function firedLine(w: Washout, first: string): string {
  if (w.fired === 0) return `Hasn't fired since ${formatDate(first)}`;
  const head = `Fired ${times(w.fired)} since ${first.slice(0, 4)}`;
  return w.status === "active"
    ? `${head} · this one began ${formatDate(w.since)}`
    : `${head} · last began ${formatDate(w.lastStart)}`;
}

/** The reading under the horizons table. Always names the sample size. */
export function readingSentence(cond: Condition, hs: HorizonSummary[], episodes: Episode[]): string {
  const one = hs.find((h) => h.key === "1m")!;
  const six = hs.find((h) => h.key === "6m")!;
  const name = cond === "under" ? "washout" : "over-80% episode";
  if (one.n === 0) return `No ${name} has had a month to play out yet.`;
  const sample = `Only ${one.n} ${name}${one.n === 1 ? "" : "s"} so far: a small sample.`;

  if (cond === "over") {
    const after = six.n === 0
      ? ""
      : `Six months after breadth went over 80%, the index was higher in ${six.higher} of ${six.n}, a median of ${pctText(six.median)} against ${pctText(six.baseline)} on an ordinary day. `;
    return `${after}Research 0001 found no edge here, so it is not an alarm. ${sample}`;
  }

  const comparable = hs.filter((h) => h.median !== null && h.baseline !== null);
  const beat = comparable.length > 0 && comparable.every((h) => h.median! > h.baseline!);
  let lead = "";
  if (six.n > 0) {
    lead = six.higher === six.n
      ? "Every washout with six months behind it was higher six months on"
      : `${six.higher} of ${six.n} washouts were higher six months on`;
    lead += beat ? ", and the median beat an ordinary day at every horizon. " : ". ";
  } else if (beat) {
    lead = "So far the median beat an ordinary day at every horizon. ";
  }
  const lows = episodes.filter((e) => e.returns["1m"] !== null && e.returns["1m"]! < -NOISE_PCT);
  const month = lows.length === 0
    ? "The first month was higher every time. "
    : `The first month was lower ${times(lows.length)} (${lows.map((e) => formatDate(e.start)).join(", ")}). `;
  return `${lead}${month}${sample}`;
}

/** The home page's notice, after the bold "Washout:". */
export function noticeText(six: HorizonSummary): string {
  const lead = `under ${WASHOUT_LINE}% of NIFTY 50 stocks are above their 200-day SMA.`;
  if (six.n === 0) return lead;
  return six.higher === six.n
    ? `${lead} After each of the last ${six.n} washouts, the index was higher 6 months later.`
    : `${lead} After ${six.higher} of the last ${six.n} washouts, the index was higher 6 months later.`;
}

/** Only while Active, and only when the reader is looking at the latest session. */
export function noticeVisible(status: Status | undefined, shown: string | null, latest: string | undefined): boolean {
  return status === "active" && shown !== null && shown === latest;
}
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/signals-copy.test.ts && bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/signals-copy.ts tests/signals-copy.test.ts
git commit -m "Signals copy: every sentence built from live numbers, with the sample size

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The query

**Files:**
- Create: `src/query/signals.ts`
- Test: `tests/signals-query.test.ts` (create)

**Interfaces:**
- Consumes: `breadthSeries` (`src/query/breadth.ts`), `buildSignals`, `Day`, `Signals` (Task 2).
- Produces: `signalsData(): Promise<Signals>`.

- [ ] **Step 1: Write the failing test**

Create `tests/signals-query.test.ts`:

```ts
import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { signalsData } from "../src/query/signals";

const row = (tradeDate: string, symbol: string, close: number) =>
  ({ tradeDate, symbol, close, sma50: 100, sma200: 100, ema200: 100, changePct: 0, volRatio: 1, turnover: 1e9 });

describe("signalsData", () => {
  beforeEach(async () => {
    for (const t of [schema.dailyIndicators, schema.indexMembers, schema.indexPrices]) await db.delete(t);
  });

  test("joins 200-day breadth to NIFTY 50 closes by date, skipping days without a close", async () => {
    await db.insert(schema.indexMembers).values([
      { indexName: "NIFTY50", symbol: "UPCO", addedOn: "2020-01-01", removedOn: null },
      { indexName: "NIFTY50", symbol: "DOWNCO", addedOn: "2020-01-01", removedOn: null },
    ]);
    await db.insert(schema.dailyIndicators).values([
      row("2026-09-30", "UPCO", 110), row("2026-09-30", "DOWNCO", 90),
      row("2026-10-01", "UPCO", 110), row("2026-10-01", "DOWNCO", 90),
    ]);
    await db.insert(schema.indexPrices).values({ tradeDate: "2026-10-01", indexName: "Nifty 50", close: 24000 });

    const s = await signalsData();
    expect(s.washout).toMatchObject({ date: "2026-10-01", pct: 50, status: "quiet", fired: 0 });
    expect(s.recent).toEqual([{ date: "2026-10-01", pct: 50 }]);
  });

  test("an empty database gives nothing to show, without throwing", async () => {
    const s = await signalsData();
    expect(s.washout).toBeNull();
    expect(s.first).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/signals-query.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `src/query/signals.ts`:

```ts
/**
 * The Signals page's data (decision 0017): 200-day SMA breadth from the same
 * query as the home page and research 0001, joined to the NIFTY 50's close.
 * Only sessions with both count, as in the study.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { breadthSeries } from "./breadth";
import { buildSignals, type Day, type Signals } from "../indicators/signals";

const INDEX = "Nifty 50"; // NSE's name in index_prices

export async function signalsData(): Promise<Signals> {
  const [breadth, rows] = await Promise.all([
    breadthSeries("sma200"),
    db.execute<{ d: string; close: number }>(
      sql`select trade_date::text d, close from index_prices where index_name = ${INDEX}`,
    ),
  ]);
  const closes = new Map(rows.map((r) => [r.d, Number(r.close)]));
  const days: Day[] = breadth
    .filter((b) => closes.has(b.date))
    .map((b) => ({ date: b.date, pct: b.pctAbove, close: closes.get(b.date)! }));
  return buildSignals(days);
}
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/signals-query.test.ts && bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/query/signals.ts tests/signals-query.test.ts
git commit -m "Signals query: 200-day breadth joined to NIFTY 50 closes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Navigation (Research group, key g)

**Files:**
- Modify: `src/components/hotkey-target.ts`, `src/components/SiteNav.tsx`, `src/components/Hotkeys.tsx` (comment only)
- Test: `tests/hotkeys.test.ts`

**Interfaces:**
- Produces: `Section` includes `"signals"`; `hotkeyTarget("g", …)` → `/signals?ma=<ma>`; on page `"signals"`, keys 1/2/3 return null.

- [ ] **Step 1: Write the failing test**

Append to `tests/hotkeys.test.ts`:

```ts
test("g opens Signals from anywhere, keeping the average", () => {
  expect(hotkeyTarget("g", { page: "breadth", ma: "ema200" })).toBe("/signals?ma=ema200");
});

test("on Signals, 1/2/3 do nothing: the page always uses the 200-day SMA", () => {
  for (const k of ["1", "2", "3"]) expect(hotkeyTarget(k, { page: "signals", ma: "sma200" })).toBeNull();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/hotkeys.test.ts`
Expected: FAIL (type error / null for "g").

- [ ] **Step 3: Implement**

In `src/components/SiteNav.tsx`:
- `export type Section = "breadth" | "advance-decline" | "crossings" | "screener" | "stock" | "signals" | "learn";`
- Add `Radar` to the lucide import.
- Replace the comment above `GROUPS` with: `Pages in labelled groups (docs/design/HANDOFF.md). A page joins here only once it is built, so the nav never links to a page that isn't there.`
- Insert a group between "Stocks" and "Help":

```ts
  {
    label: "Research",
    links: [
      { key: "signals", href: "/signals", label: "Signals", short: "Signals", hint: "g", icon: Radar },
    ],
  },
```

- `SHORTCUTS`: change `["b a c s r l", "Switch page"]` to `["b a c s r g l", "Switch page"]`.

In `src/components/hotkey-target.ts`:
- Add `signals: "/signals",` to `BASE` (after `stock`).
- Change `if (c.page === "stock") return null;` to `if (c.page === "stock" || c.page === "signals") return null;` and update the doc comment's last sentence to: `1–3 switch the average, except on a Report Card or Signals, which have none to switch.`
- After the `r` line add: `if (key === "g") return \`/signals?ma=${c.ma}\`;`

In `src/components/Hotkeys.tsx` comment: `b/a/c/s/r/l` → `b/a/c/s/r/g/l`.

- [ ] **Step 4: Run tests**

Run: `bun test tests/hotkeys.test.ts && bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/hotkey-target.ts src/components/SiteNav.tsx src/components/Hotkeys.tsx tests/hotkeys.test.ts
git commit -m "Nav: Research group with Signals, key g

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(The link 404s until Task 7; that's fine between commits on a local branch.)

---

### Task 6: Glossary terms and live examples

**Files:**
- Modify: `src/lib/glossary.ts`, `src/query/glossary-live.ts`
- Test: `tests/glossary.test.ts`, `tests/glossary-live.test.ts`

**Interfaces:**
- Consumes: `signalsData` (Task 4), `pctText` (Task 3).
- Produces: `TermId`s `"washout"`, `"episode"`, `"forward-return"`.

- [ ] **Step 1: Write the failing tests**

In `tests/glossary.test.ts`, inside `test("covers the terms on screen", …)` add:

```ts
    for (const id of ["washout", "episode", "forward-return"]) expect(isTermId(id)).toBe(true);
```

In `tests/glossary-live.test.ts`, inside the `describe("liveExample", …)` block add:

```ts
  test("washout reads today's 200-day breadth", async () => {
    await db.insert(schema.indexMembers).values([
      { indexName: "NIFTY50", symbol: "UPCO", addedOn: "2020-01-01", removedOn: null },
      { indexName: "NIFTY50", symbol: "DOWNCO", addedOn: "2020-01-01", removedOn: null },
    ]);
    await db.insert(schema.dailyIndicators).values([
      { tradeDate: "2026-10-01", symbol: "UPCO", close: 110, sma50: 100, sma200: 100, ema200: 100, changePct: 1, volRatio: 1, turnover: 1e9 },
      { tradeDate: "2026-10-01", symbol: "DOWNCO", close: 90, sma50: 100, sma200: 100, ema200: 100, changePct: -1, volRatio: 1, turnover: 1e9 },
    ]);
    await db.insert(schema.indexPrices).values({ tradeDate: "2026-10-01", indexName: "Nifty 50", close: 24000 });
    expect(await liveExample("washout")).toBe("On 1 Oct 2026, 50% of NIFTY 50 stocks were above their 200-day SMA: no washout.");
    expect(await liveExample("episode")).toBeNull(); // no washout yet
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/glossary.test.ts tests/glossary-live.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/lib/glossary.ts`, in `IDS`, after `"five-session-change",` add `"washout", "episode", "forward-return",`. Add these entries to `GLOSSARY` right after the `"five-session-change"` entry:

```ts
  washout: {
    id: "washout", term: "Washout (breadth under 20%)", topic: "Breadth",
    short: "When fewer than 20% of NIFTY 50 stocks close above their 200-day average: nearly the whole index is in a downtrend. Rare, and historically followed by better-than-usual returns.",
    read: "Active: under 20% now. Watching: 20–25%, close to the line or just recovered. Quiet: above 25%. It says the selling has been broad, not that the bottom is in.",
    what: "Research 0001 tested what the NIFTY 50 did after each breadth level since 2020. Only this one stood out: when it was written (Oct 2026), every past washout had been followed by a higher index six months later. There have been only a handful, and the first month can still hurt: in March 2020 the index fell another 14% first. The Signals page shows the up-to-date count. tradeSence uses the 200-day SMA only, because the 50-day version was noisy.",
    calc: { plain: "Each session: the share of that day's NIFTY 50 members whose close is above their 200-day SMA. Under 20% is a washout. Weak days within 10 sessions of each other are one washout (see Episode)." },
    example: "8 of 50 stocks above their 200-day SMA is 16%: a washout. 11 of 50 is 22%: Watching.",
    mistakes: [
      "Reading it as \"buy now\". It marks broad selling, not the low: the index can keep falling for weeks.",
      "Counting every weak day as a new signal. Neighbouring days are the same event: count episodes.",
    ],
    related: ["breadth", "episode", "forward-return"],
    seeIt: { label: "Signals", href: "/signals" },
  },
  episode: {
    id: "episode", term: "Episode", topic: "Breadth",
    short: "One stretch of extreme breadth counted as a single event: weak days within 10 sessions of each other belong to the same episode, so one sell-off isn't counted fifty times.",
    read: "\"6 episodes since 2020\" means six separate sell-offs or dips, not six days.",
    what: "March 2020 had dozens of days under 20%. Counting each as a separate signal would make one crash look like overwhelming evidence. Grouping them into episodes gives the honest count, and returns are measured from each episode's first day.",
    calc: { plain: "An episode starts on the first day that meets the condition (for example breadth under 20%). Any qualifying day within 10 sessions of the last one continues it; a longer break starts a new episode." },
    example: "Under 20% on 3 and 5 March, back above for 4 sessions, under again on 11 March: one episode starting 3 March. Back above for 15 sessions before the next dip: two episodes.",
    mistakes: ["Comparing day counts with episode counts. 60 weak days might be just 2 episodes."],
    related: ["washout", "forward-return"],
    seeIt: { label: "Signals", href: "/signals" },
  },
  "forward-return": {
    id: "forward-return", term: "Forward return", topic: "Breadth",
    short: "How much the NIFTY 50 rose or fell over the next 1, 3 or 6 months (21, 63 or 126 sessions) from a given day. Used to test whether a signal was followed by anything unusual.",
    read: "Compare it with the same figure for an ordinary day: a signal only matters if what followed it was better or worse than usual.",
    what: "It is history, not a forecast. tradeSence shows the median (the middle value) across episodes, how many were higher, the best and the worst, next to the median for every session since 2020.",
    calc: {
      plain: "NIFTY 50 close h sessions later ÷ close on the day, minus 1. Left out when that day hasn't come yet, or when the data has a gap in between.",
      exact: "return = close[t + h] ÷ close[t] − 1, h = 21, 63, 126",
    },
    example: "The NIFTY 50 closed at 22,000 on the day a washout began and at 24,200 126 sessions later: a 6-month forward return of +10%.",
    mistakes: [
      "Reading a high median as a promise. With five cases, one different crash changes everything.",
      "Forgetting the baseline: the index rose over most of 2020–2026, so most days were followed by gains.",
    ],
    related: ["washout", "episode"],
    seeIt: { label: "Signals", href: "/signals" },
  },
```

In `src/query/glossary-live.ts`:
- Add imports: `import { signalsData } from "./signals";` and `import { pctText } from "../components/signals-copy";`
- Add a case before `case "crossing":`:

```ts
    case "washout": case "episode": case "forward-return": {
      const s = await signalsData();
      const w = s.washout;
      if (!w || !s.first) return null;
      if (id === "washout") {
        const state = w.status === "active" ? "a washout" : w.status === "watching" ? "within 5 pts of the washout line" : "no washout";
        return `On ${formatDate(w.date)}, ${w.pct.toFixed(0)}% of NIFTY 50 stocks were above their 200-day SMA: ${state}.`;
      }
      if (id === "episode") {
        return w.fired === 0 ? null
          : `Since ${formatDate(s.first)}, 200-day breadth has fallen under 20% in ${w.fired} separate episode${w.fired === 1 ? "" : "s"}; the latest began on ${formatDate(w.lastStart)}.`;
      }
      const six = s.horizons.under.find((h) => h.key === "6m")!;
      return six.n === 0 ? null
        : `After the ${six.n} washout${six.n === 1 ? "" : "s"} with six months behind them, the NIFTY 50's median 6-month return was ${pctText(six.median)}, against ${pctText(six.baseline)} for an ordinary day.`;
    }
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/glossary.test.ts tests/glossary-live.test.ts && bunx tsc --noEmit`
Expected: PASS (the existing "empty database → null" test covers the three new ids).

- [ ] **Step 5: Commit**

```bash
git add src/lib/glossary.ts src/query/glossary-live.ts tests/glossary.test.ts tests/glossary-live.test.ts
git commit -m "Glossary: washout, episode and forward return, with live examples

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The `/signals` page

**Files:**
- Create: `src/components/WashoutSpark.tsx`, `src/components/WashoutCard.tsx`, `src/components/ReturnBuckets.tsx`, `src/components/ForwardReturns.tsx`, `src/components/EpisodeTable.tsx`, `src/app/signals/page.tsx`
- Modify: `tests/motion.test.ts`

**Interfaces:**
- Consumes: `signalsData` (Task 4); `isCondition`, `WASHOUT_LINE`, types (Task 2); `STATUS_LABEL`, `washoutSentence`, `firedLine`, `readingSentence`, `pctText`, `toneClass` (Task 3); `HORIZONS` (`src/research/forward-returns.ts`); `"signals"` section (Task 5); `washout` / `episode` / `forward-return` terms (Task 6).

Before writing framework code, skim `node_modules/next/dist/docs/` for the app-router page and `searchParams` guide (Next.js 16: `searchParams` is a Promise, as the existing pages show).

- [ ] **Step 1: Extend the motion test (failing)**

In `tests/motion.test.ts`:
- In the "every chart takes its motion from useChartAnimation" test, add `"WashoutSpark", "ReturnBuckets"` to the list of chart files.
- In "every segmented switch has a sliding pill", add `"src/components/ForwardReturns.tsx"` to `files`.

Run: `bun test tests/motion.test.ts`
Expected: FAIL (files don't exist).

- [ ] **Step 2: Sparkline**

Create `src/components/WashoutSpark.tsx`:

```tsx
"use client";

import { Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import { formatDate } from "@/lib/format";
import { useChartAnimation } from "@/lib/motion";

export type SparkPoint = { date: string; pct: number };

const config = { pct: { label: "Share above the 200-day SMA", color: "var(--chart-1)" } } satisfies ChartConfig;

/** The detector's recent breadth with its threshold. One series: no legend. */
export default function WashoutSpark({ data, line }: { data: SparkPoint[]; line: number }) {
  const anim = useChartAnimation();
  const top = Math.max(50, Math.ceil(Math.max(...data.map((d) => d.pct), 0) / 10) * 10);
  return (
    <ChartContainer config={config} className="aspect-auto h-[140px] w-full">
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <XAxis dataKey="date" hide />
        <YAxis
          domain={[0, top]}
          ticks={[0, line, top]}
          tickFormatter={(v: number) => `${v}%`}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={36}
        />
        <ReferenceLine y={line} stroke="var(--down)" strokeDasharray="4 4" />
        <ChartTooltip
          cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
          content={
            <ChartTooltipContent
              indicator="dot"
              labelFormatter={(_l, payload) => formatDate((payload?.[0]?.payload as SparkPoint | undefined)?.date)}
              formatter={(value) => (
                <span className="font-semibold tabular-nums text-foreground">{Number(value).toFixed(0)}% above</span>
              )}
            />
          }
        />
        <Line
          dataKey="pct"
          type="monotone"
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={false}
          {...anim}
          activeDot={{ r: 3, strokeWidth: 2, stroke: "var(--card)", fill: "var(--chart-1)" }}
        />
      </LineChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 3: Detector card**

Create `src/components/WashoutCard.tsx`:

```tsx
import { Card, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Term from "@/components/Term";
import WashoutSpark, { type SparkPoint } from "@/components/WashoutSpark";
import { STATUS_LABEL, firedLine, washoutSentence } from "@/components/signals-copy";
import { WASHOUT_LINE, type Washout } from "@/indicators/signals";
import { cn } from "@/lib/utils";

const TONE = { active: "down", watching: "neutral", quiet: "outline" } as const;

/** The washout alarm: status, one sentence, recent breadth against the line. */
export default function WashoutCard({
  washout, recent, first, className,
}: { washout: Washout; recent: SparkPoint[]; first: string; className?: string }) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <div className="grid gap-4 px-5 pb-4 pt-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-heading text-foreground"><Term id="washout">Washed out</Term></h2>
            <Badge variant={TONE[washout.status]}>{STATUS_LABEL[washout.status]}</Badge>
          </div>
          <p className="text-[13px] leading-5 text-foreground-2">{washoutSentence(washout)}</p>
          <p className="text-[12px] leading-4 text-muted-foreground">
            Only the 200-day SMA: it is the one average research 0001 found reliable.
          </p>
        </div>
        <div className="min-w-0">
          <p className="mb-1 text-[12px] text-muted-foreground">Share above the 200-day SMA, last {recent.length} sessions</p>
          <WashoutSpark data={recent} line={WASHOUT_LINE} />
        </div>
      </div>
      <CardFooter className="mt-auto">{firedLine(washout, first)}</CardFooter>
    </Card>
  );
}
```

- [ ] **Step 4: Bucket chart**

Create `src/components/ReturnBuckets.tsx`:

```tsx
"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, XAxis, YAxis } from "recharts";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import { signed } from "@/lib/format";
import { useChartAnimation } from "@/lib/motion";

export type BucketBar = { bucket: string; median: number | null; n: number };

const LABELS: Record<string, string> = {
  "<20": "Under 20%", "20–40": "20–40%", "40–60": "40–60%", "60–80": "60–80%", "≥80": "Over 80%",
};
const config = { median: { label: "Median 3-month return", color: "var(--chart-muted)" } } satisfies ChartConfig;

/** Median 3-month return by breadth bucket; the selected condition's bar in brand. */
export default function ReturnBuckets({ data, all, highlight }: { data: BucketBar[]; all: number | null; highlight: string }) {
  const anim = useChartAnimation();
  const vals = [...data.map((d) => d.median ?? 0), all ?? 0, 0];
  const lo = Math.floor(Math.min(...vals) / 4) * 4;
  const hi = Math.max(4, Math.ceil(Math.max(...vals) / 4) * 4);
  return (
    <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
      <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--grid-line)" vertical={false} />
        <XAxis
          dataKey="bucket"
          tickFormatter={(b: string) => LABELS[b] ?? b}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis
          domain={[lo, hi]}
          tickFormatter={(v: number) => `${v}%`}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        {all !== null && (
          <ReferenceLine
            y={all}
            stroke="var(--border-strong)"
            strokeDasharray="4 4"
            label={{ value: `Any day ${signed(all, 1)}%`, position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 11 }}
          />
        )}
        <ChartTooltip
          cursor={{ fill: "var(--raised)" }}
          content={
            <ChartTooltipContent
              hideIndicator
              labelFormatter={(_l, payload) => {
                const b = payload?.[0]?.payload as BucketBar | undefined;
                return b ? LABELS[b.bucket] ?? b.bucket : "";
              }}
              formatter={(value, _name, item) => {
                const b = item?.payload as BucketBar | undefined;
                return (
                  <div className="flex w-full items-center justify-between gap-4 tabular-nums">
                    <span className="text-muted-foreground">{b?.n ?? 0} sessions</span>
                    <span className="font-semibold text-foreground">{value == null ? "—" : `${signed(Number(value), 1)}%`}</span>
                  </div>
                );
              }}
            />
          }
        />
        <Bar dataKey="median" radius={[4, 4, 0, 0]} {...anim}>
          {data.map((d) => (
            <Cell key={d.bucket} fill={d.bucket === highlight ? "var(--brand)" : "var(--chart-muted)"} />
          ))}
          <LabelList
            dataKey="median"
            position="top"
            formatter={(v: unknown) => (typeof v === "number" ? `${signed(v, 1)}%` : "")}
            className="fill-foreground-2 text-[11px] tabular-nums"
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 5: Forward-returns card**

Create `src/components/ForwardReturns.tsx`:

```tsx
import Link from "next/link";
import { Card } from "@/components/ui/card";
import Term from "@/components/Term";
import SlidingPill from "@/components/SlidingPill";
import ReturnBuckets from "@/components/ReturnBuckets";
import { pctText, readingSentence, toneClass } from "@/components/signals-copy";
import type { BucketMedian, Condition, Episode, HorizonSummary } from "@/indicators/signals";
import { cn } from "@/lib/utils";

const OPTIONS: { key: Condition; label: string }[] = [
  { key: "under", label: "Under 20%" },
  { key: "over", label: "Over 80%" },
];
const head = "px-3 py-2 text-right text-[11px] font-medium uppercase tracking-[0.06em]";
const seg = (on: boolean) =>
  cn(
    "inline-flex h-8 items-center rounded-[8px] px-3 text-[13px] font-medium transition-colors",
    on ? "bg-thumb text-foreground shadow-thumb" : "text-muted-foreground hover:text-foreground",
  );

type Props = {
  ma: string;
  cond: Condition;
  horizons: HorizonSummary[];
  episodes: Episode[];
  buckets: { buckets: BucketMedian[]; all: number | null };
  className?: string;
};

/** What the NIFTY 50 did after each episode, against an ordinary day, and by breadth level. */
export default function ForwardReturns({ ma, cond, horizons, episodes, buckets, className }: Props) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-4">
        <div>
          <h2 className="text-heading text-foreground"><Term id="forward-return">What happened next</Term></h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            NIFTY 50, from the first session of each {cond === "under" ? "washout" : "over-80% episode"}
          </p>
        </div>
        <div className="seg relative inline-flex items-center gap-0.5 rounded-md border bg-raised p-0.5" role="tablist" aria-label="Breadth condition">
          <SlidingPill active={cond} />
          {OPTIONS.map((o) => (
            <Link key={o.key} href={`/signals?ma=${ma}&cond=${o.key}`} scroll={false} role="tab" aria-selected={cond === o.key} className={seg(cond === o.key)}>
              {o.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-6 px-5 pb-5 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-[13px] tabular-nums">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className={cn(head, "pl-4 text-left")}>Horizon</th>
                  <th className={head}>Median</th>
                  <th className={head}>Higher</th>
                  <th className={head}>Best</th>
                  <th className={head}>Worst</th>
                  <th className={cn(head, "pr-4")}>Any day</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {horizons.map((h) => (
                  <tr key={h.key}>
                    <td className="py-2 pl-4 pr-3 text-foreground">{h.label}</td>
                    <td className={cn("px-3 py-2 text-right font-semibold", toneClass(h.median))}>{pctText(h.median)}</td>
                    <td className="px-3 py-2 text-right text-foreground-2">{h.n === 0 ? "—" : `${h.higher} of ${h.n}`}</td>
                    <td className={cn("px-3 py-2 text-right", toneClass(h.best))}>{pctText(h.best)}</td>
                    <td className={cn("px-3 py-2 text-right", toneClass(h.worst))}>{pctText(h.worst)}</td>
                    <td className="py-2 pl-3 pr-4 text-right text-foreground-2">{pctText(h.baseline)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[13px] leading-5 text-foreground-2">{readingSentence(cond, horizons, episodes)}</p>
        </div>

        <div className="min-w-0">
          <p className="mb-2 text-[12px] font-medium text-muted-foreground">Median 3-month return, by breadth on the day</p>
          <ReturnBuckets
            data={buckets.buckets.map((b) => ({ bucket: b.bucket, n: b.n, median: b.median === null ? null : Math.round(b.median * 10) / 10 }))}
            all={buckets.all === null ? null : Math.round(buckets.all * 10) / 10}
            highlight={cond === "under" ? "<20" : "≥80"}
          />
          <p className="mt-2 text-[12px] leading-4 text-muted-foreground">
            Counted by session: neighbouring days overlap, so the episodes are the honest count.
          </p>
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 6: Episodes table**

Create `src/components/EpisodeTable.tsx`:

```tsx
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Term from "@/components/Term";
import { pctText, toneClass } from "@/components/signals-copy";
import { HORIZONS } from "@/research/forward-returns";
import type { Condition, Episode } from "@/indicators/signals";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const head = "px-3 py-2 text-right text-[11px] font-medium uppercase tracking-[0.06em]";

/** Every episode of the selected condition, newest first, with the NIFTY 50's returns from its first day. */
export default function EpisodeTable({
  cond, episodes, first, className,
}: { cond: Condition; episodes: Episode[]; first: string; className?: string }) {
  const rows = [...episodes].reverse();
  const under = cond === "under";
  const name = under ? "under 20%" : "over 80%";
  return (
    <Card className={cn("flex flex-col", className)}>
      <div className="flex items-start justify-between gap-3 border-b px-5 py-3.5">
        <div>
          <h2 className="text-heading text-foreground"><Term id="episode">{`Episodes ${name}`}</Term></h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Most recent first, 200-day SMA</p>
        </div>
        <Badge variant="neutral">{rows.length} episode{rows.length === 1 ? "" : "s"}</Badge>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-muted-foreground">No episode {name} since {formatDate(first)}.</p>
      ) : (
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-[13px] tabular-nums">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b text-muted-foreground">
                <th className={cn(head, "pl-5 text-left")}>Started</th>
                <th className={head}>{under ? "Lowest" : "Highest"}</th>
                <th className={head}>{under ? "Sessions under" : "Sessions over"}</th>
                {HORIZONS.map((h) => (
                  <th key={h.key} className={cn(head, "last:pr-5")}>{h.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((e) => (
                <tr key={e.start}>
                  <td className="py-2 pl-5 pr-3 text-foreground">{formatDate(e.start)}</td>
                  <td className="px-3 py-2 text-right text-foreground-2">{e.extreme.toFixed(0)}%</td>
                  <td className="px-3 py-2 text-right text-foreground-2">{e.sessions}</td>
                  {HORIZONS.map((h) => {
                    const v = e.returns[h.key];
                    return (
                      <td key={h.key} className={cn("px-3 py-2 text-right last:pr-5", v === null ? "text-muted-foreground" : toneClass(v))}>
                        {v === null ? (e.pending[h.key] ? "Not yet" : "—") : pctText(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-auto border-t px-5 py-3 text-[12px] text-muted-foreground">
        An episode starts on the first close {name}; another within 10 sessions continues it. Returns run from the
        NIFTY 50&apos;s close on that first day. Not yet: that many sessions haven&apos;t passed. —: a gap in the data.
      </p>
    </Card>
  );
}
```

- [ ] **Step 7: The page**

Create `src/app/signals/page.tsx`:

```tsx
import { Info } from "lucide-react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import Hotkeys from "@/components/Hotkeys";
import WashoutCard from "@/components/WashoutCard";
import ForwardReturns from "@/components/ForwardReturns";
import EpisodeTable from "@/components/EpisodeTable";
import { Card } from "@/components/ui/card";
import { isCondition, type Condition } from "@/indicators/signals";
import { signalsData } from "@/query/signals";
import type { MaKind } from "@/query/breadth";

export const dynamic = "force-dynamic";

// This page always uses the 200-day SMA (decision 0017). `ma` is only carried so
// the nav keeps the reader's choice on other pages. Every param is checked the
// same strict way as everywhere else (CLAUDE.md, sql.raw).
function isMaKind(v: string | undefined): v is MaKind {
  return v === "sma200" || v === "ema200" || v === "sma50";
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ma?: string; cond?: string }>;
}) {
  const sp = await searchParams;
  const ma: MaKind = isMaKind(sp.ma) ? sp.ma : "sma200";
  const cond: Condition = isCondition(sp.cond) ? sp.cond : "under";
  const s = await signalsData();

  return (
    <AppShell current="signals" ma={ma} asOf={s.washout?.date}>
      <Hotkeys ma={ma} page="signals" />

      <PageHeader
        eyebrow="NIFTY 50 · Research"
        title="Signals"
        description="What happened next. Index returns after breadth extremes, and the alarm that history supports."
      />

      {!s.washout || !s.first ? (
        <Card className="px-6 py-12 text-center">
          <p className="text-heading text-foreground">Nothing loaded yet</p>
          <p className="mt-2 text-[13px] text-foreground-2">
            Signals needs breadth and NIFTY 50 closes. Run{" "}
            <code className="rounded-sm bg-raised px-1.5 py-0.5 font-mono text-[12px]">bun run ingest:indices</code>{" "}
            and <code className="rounded-sm bg-raised px-1.5 py-0.5 font-mono text-[12px]">bun run indicators</code>.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="reveal flex items-start gap-2.5 rounded-lg border bg-raised px-4 py-3 text-[13px] leading-5 text-foreground-2 lg:col-span-12">
            <Info className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
            <span>
              <strong className="font-medium text-foreground">History starts in {s.first.slice(0, 4)},</strong> on the
              index&apos;s real membership each day. That holds only a handful of washouts, so read the direction, not
              the decimals.
            </span>
          </div>
          <WashoutCard className="lg:col-span-12" washout={s.washout} recent={s.recent} first={s.first} />
          <ForwardReturns
            className="lg:col-span-12"
            ma={ma}
            cond={cond}
            horizons={s.horizons[cond]}
            episodes={s.episodes[cond]}
            buckets={s.buckets}
          />
          <EpisodeTable className="lg:col-span-12" cond={cond} episodes={s.episodes[cond]} first={s.first} />
        </div>
      )}
    </AppShell>
  );
}
```

- [ ] **Step 8: Run tests and typecheck**

Run: `bun test tests/motion.test.ts && bunx tsc --noEmit`
Expected: PASS. If Recharts' types reject the `LabelList` `formatter` or a tooltip formatter, adjust only the type annotation (e.g. `(v: unknown)`), never the behaviour.

- [ ] **Step 9: See it working**

Run `bun run dev` in the background, then:

```bash
curl -s "http://localhost:3000/signals" | grep -o "Active\|Watching\|Quiet" | head -1
curl -s "http://localhost:3000/signals?cond=OVER" -o /dev/null -w "%{http_code}\n"
curl -s "http://localhost:3000/signals?cond=over" | grep -c "Over 80%"
```

Expected: `Active` (breadth has been under 20% since 1 Oct 2026); `200`; a count ≥ 1. Open `/signals` in the browser (use the `run` skill or Claude in Chrome) and check, in dark and light theme and at phone width: the badge, the sparkline with its dashed 20% line, the switch sliding between Under/Over, the table, the bar chart with the brand bar, the episode table with "Not yet" on the 1 Oct 2026 row. Confirm the 6-month "k of n" matches `bun run research:forward-returns` (episodes below 20%, 6-month column, excluding "not yet"). Note that the study's table uses *averages*, the page *medians*.

- [ ] **Step 10: Commit**

```bash
git add src/components/WashoutSpark.tsx src/components/WashoutCard.tsx src/components/ReturnBuckets.tsx src/components/ForwardReturns.tsx src/components/EpisodeTable.tsx src/app/signals/page.tsx tests/motion.test.ts
git commit -m "Signals page: washout alarm, what happened next, and every episode

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

If `next dev` rewrote the Next.js block in `AGENTS.md`, commit that too (CLAUDE.md).

---

### Task 8: Home-page notice

**Files:**
- Create: `src/components/WashoutNotice.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `signalsData` (Task 4), `noticeText`, `noticeVisible` (Task 3; already tested).

- [ ] **Step 1: Notice component**

Create `src/components/WashoutNotice.tsx`:

```tsx
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/** One line on Breadth while the washout alarm is Active (decision 0017). */
export default function WashoutNotice({ text, ma, className }: { text: string; ma: string; className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        "reveal flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-down/30 bg-down-soft px-4 py-2.5 text-[13px] leading-5 text-foreground",
        className,
      )}
    >
      <TriangleAlert className="size-4 shrink-0 text-down" aria-hidden="true" />
      <span><strong className="font-semibold text-down">Washout:</strong> {text}</span>
      <Link href={`/signals?ma=${ma}`} className="ml-auto font-medium text-brand hover:underline">See Signals →</Link>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into Breadth**

In `src/app/page.tsx`:
- Imports: `import WashoutNotice from "@/components/WashoutNotice";`, `import { noticeText, noticeVisible } from "@/components/signals-copy";`, `import { signalsData } from "@/query/signals";`
- Change the data line to:
  `const [series, view, signals] = await Promise.all([breadthSeries(ma), breakdownOn(ma, wanted), signalsData()]);`
- After `const point = …`, add:

```ts
  // Today's washout, only while it is Active and the reader is on the latest session.
  const six = signals.horizons.under.find((h) => h.key === "6m");
  const notice = six && noticeVisible(signals.washout?.status, view.date, signals.washout?.date) ? noticeText(six) : null;
```

- Inside the grid, before `<BreadthHero`, add:
  `{notice && <WashoutNotice className="lg:col-span-12" text={notice} ma={ma} />}`

- [ ] **Step 3: Typecheck and see it**

Run: `bunx tsc --noEmit && bun test`
Expected: PASS (all suites).

With the dev server running:

```bash
curl -s "http://localhost:3000/" | grep -c "See Signals"
curl -s "http://localhost:3000/?date=2025-06-02" | grep -c "See Signals"
```

Expected: `1`, then `0`.

- [ ] **Step 4: Commit**

```bash
git add src/components/WashoutNotice.tsx src/app/page.tsx
git commit -m "Breadth: a one-line washout notice while the alarm is Active

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Decision record, research refresh and docs

**Files:**
- Create: `docs/decisions/0017-signals-washout.md`
- Modify: `docs/decisions/README.md`, `docs/research/0001-does-breadth-predict.md`, `README.md`, `CLAUDE.md`, `TODO.md`

- [ ] **Step 1: Decision record**

Create `docs/decisions/0017-signals-washout.md`, in plain language, with these sections and contents:

- **Title:** `# 0017 — Signals page: the breadth washout alarm`, date 2026-10-03.
- **The problem:** breadth on the 200-day SMA fell under 20% on 1 Oct 2026. Research 0001 found this is the one breadth reading with a track record, but the app showed it as a plain number. The owner wanted an alarm with its evidence next to it.
- **What we built:** `/signals` (status, sentence, sparkline, what happened next, every episode) and a one-line notice on Breadth while Active. Computed on every page view.
- **Decisions, each with options and why:**
  1. *Only the washout for now* (options: washout + its history; washout alone; all three detectors). Chosen: washout + history. Why: thrust and divergence have no study behind them; a thrust designed for ~3,000 NYSE stocks may fire too easily on 50; the divergence's thresholds must come from data. They stay off the page entirely, no "coming soon" boxes.
  2. *200-day SMA only, no tabs* (options: no tabs; tabs that change only the history; tabs that change the alarm too). Chosen: no tabs. Why: the 50-day version was noisy and the 200 EMA nearly identical; tabs would let the page show an alarm research says not to trust.
  3. *Dropped the mockup's "20–80%" option.* It is ordinary days, which the bar chart already shows.
  4. *Computed live, not saved nightly.* A table only pays off when the nightly digest needs it (later TODO). Live means the page can never go stale.
  5. *One episode rule.* `findEpisodeSpans` now returns spans; research 0001, the Report Card and Signals all use it, so they can't disagree about how many washouts there were. (The Report Card additionally merges crashes whose 3-month windows overlap; that's why it counts fewer "crashes" than Signals counts washouts.)
  6. *Exactly 20% is "Watching", not "Active"*: research defines a washout as under 20%.
  7. *Home notice only while Active and only on the latest session*, so a reader looking at March 2025 isn't told about today.
- **Something we found along the way:** re-running research 0001 on 3 Oct gave different numbers than the note written on 2 Oct (1,670 → 1,678 sessions; the early-2025 episode moved from 28 Feb to 24 Feb 2025, its 6-month return from +11.8% to +9.2%). Cause: decision 0007 loaded 8 weekend sessions 36 minutes after the study was committed; one of them, the Budget Saturday 1 Feb 2025, nudged the averages so that 24 Feb 2025 now reads 18%. Fix: research 0001 refreshed; the page computes its numbers live so it can't drift like this.

- [ ] **Step 2: Decisions index**

Add a row to the table in `docs/decisions/README.md`, after 0016, in the same column format as the rows above it:

```
| [0017](0017-signals-washout.md) | 2026-10-03 | Signals page: the breadth washout alarm | Washout only (thrust and divergence wait for studies), 200-day SMA only, computed live; one shared episode rule; research 0001 refreshed after the weekend-sessions shift |
```

(Check the existing header columns first and match them exactly.)

- [ ] **Step 3: Refresh research 0001**

Run: `bun run research:forward-returns > /private/tmp/claude-501/-Users-4bh1nav-personalProjects-tradeSence/5dd651f2-6af2-459c-803c-1ef0b1632fa5/scratchpad/0001.md`

In `docs/research/0001-does-breadth-predict.md`:
- Replace everything under `## Appendix: full results (generated)` with the new output.
- Update the episode table in "How to read the numbers" (the 2025 row becomes `2025-02-24 | 18% | +4.6% | +9.6% | +9.2%`), recompute the "Average of the 5" row and the "Normal (all days)" row from the new output, and update the short-answer table's "+14%" if the new 6-month average differs (it is about +13.6%).
- Add under the date line: `**Refreshed 2026-10-03:** 8 weekend sessions (decision 0007) were loaded after this was first written, which moved the early-2025 episode from 28 Feb to 24 Feb 2025. The conclusion is unchanged. See decision 0017.`

- [ ] **Step 4: README, CLAUDE.md, TODO**

- `README.md` → Function reference: add a section `### \`src/indicators/signals.ts\` and \`src/query/signals.ts\` — the Signals page` listing `washoutStatus`, `forwardReturnSafe`, `episodesOf`, `summarizeHorizons`, `bucketMedians`, `buildSignals`, `signalsData` with one line each; in the existing `episodes.ts` section mention `findEpisodeSpans`.
- `CLAUDE.md` → "What this is": add `/signals` (`src/query/signals.ts` + `src/indicators/signals.ts`: the breadth washout alarm and what happened next) to the page list. In the `isMaKind` gotcha, add `signals/` to the list of pages that duplicate it.
- `TODO.md`: tick "Breadth washout alarm" (`- [x] … : 0017`), move it to "Done" as `- [x] Signals page: breadth washout alarm: 0017`, and rewrite "Where we left off" to point at the breadth-thrust study next, plus checking Monday's nightly run.

- [ ] **Step 5: Final verification**

Run: `bun test && bunx tsc --noEmit`
Expected: every suite PASS, no type errors. Paste the summary line in the commit or the hand-off message.

- [ ] **Step 6: Commit**

```bash
git add docs/decisions/0017-signals-washout.md docs/decisions/README.md docs/research/0001-does-breadth-predict.md README.md CLAUDE.md TODO.md
git commit -m "Document the Signals page (decision 0017); refresh research 0001

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
