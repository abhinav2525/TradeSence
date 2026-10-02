# Report Card: three new lights — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three traffic lights to `/stock/[symbol]` — Right now (RiskMetrics volatility vs its own year), Bad days (down capture, plus up capture and beta), In crashes (falls in breadth-collapse episodes vs the NIFTY 50) — each proven by tests and the independent audit.

**Architecture:** Pure functions in a new `src/indicators/market-risk.ts` (volatility, capture, crash episodes) over the adjusted line `stockReport` already builds; `findEpisodes` moves from `src/research/` to `src/indicators/episodes.ts` so the study and the card share it. `stockReport` assembles three new fields; `StockChecks` shows eight cards; a new `CrashTable` lists the episodes. `src/audit/report-card.ts` recomputes every new number from raw prices.

**Tech Stack:** Bun (test runner, `bun:test`), TypeScript, Next.js 16 (server components; `params`/`searchParams` are Promises), Drizzle + Postgres, Tailwind v4, shadcn.

**Spec:** `docs/superpowers/specs/2026-10-02-report-card-three-lights-design.md`

## Global Constraints

- NIFTY 50 members only; education, not tips: no score, no verdict; `LIGHTS_DISCLAIMER` stays.
- Everything from the adjusted daily moves (`daily_indicators.change_pct`) via `adjustedLine`; only data on or before the chosen date.
- RiskMetrics λ = **0.94**, seeded with the sample variance of a segment's first **20** moves; restarts at each segment.
- Right now: ratio σₜ ÷ `dailyVolatility` (last 250 moves). 🟢 ≤ **1.0** · 🟡 ≤ **1.5** · 🔴 > 1.5. No light under **250** moves. Week = σₜ × √5.
- Hit rate: last **500** sessions, σ from day t for the move t → t+5, omitted under **100** stretches; shown as measured.
- Bad days: last **250** sessions with both moves, matched by date; no light under **120**. 🟢 down capture ≤ **100%** · 🟡 ≤ **120%** · 🔴 > 120%. NIFTY moves with |move| ≤ `NOISE_PCT` count in neither capture.
- In crashes: 200-SMA breadth < **20%**, merge gap **10** sessions (research 0001); counted once **63** sessions have passed; fall = lowest level in the next 63 sessions ÷ start − 1 (0 if never below); back = level 126 sessions later ≥ start; light = median stock fall ÷ median NIFTY fall with `ratio` cut-offs **1.2 / 1.8**; no light under **3** counted episodes or if the NIFTY's median fall is 0.
- Every comparison of returns uses `NOISE_PCT` (decision 0013). Never compare two computed returns for exact equality.
- Copy: true minus "−", Indian digit grouping (`formatInt`), dates as "1 Oct 2026" (`formatDate`). Design tokens only (`text-foreground-2`, `bg-card`…), never raw hex. Colour is never the only signal.
- Every new label gets a glossary entry and a `<Term>` (CLAUDE.md rule); never put `<Term>` inside a `<Link>` or button.
- Tests run from the repo root only (`bun test`), against `tradesence_test`.
- Before each commit: `git checkout -- next-env.d.ts` (the dev server rewrites it). Commit trailer:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01Ayzq2CX4q88qx2ZJ7f99JG`.

## Review Focus

1. **Today's crash episode is still under way** (breadth fell below 20% on 1 Oct 2026): it must not be counted, and the card must say so. Pinned in Task 2 (`ongoing`) and Task 3 (report on the latest day of a seeded episode).
2. **A short or recent history** (JIOFIN, a new listing): lights with too little data are null ("Not enough…"), never a colour from a handful of sessions; a crash before the stock's first session is skipped. Pinned in Task 2 (no data at start) and Task 3 (100-session stock).
3. **A past date** (`?date=2020-03-23`, inside the COVID crash): σ, capture and episodes use only data up to that date; the March 2020 episode is ongoing, not counted. Pinned in Task 3 (report as of a day inside an episode).
4. **A data gap inside a window** (a stock suspended for a month): a crash window or a hit-rate week across a segment break is skipped, never measured across the hole. Pinned in Task 1 (EWMA restart) and Task 2 (segment break skipped).
5. **A split day** (KOTAKBANK 1:5): the raw ÷5 close must not show up as a huge move in σ, the range or beta. Pinned in Task 3 (twin stocks, one with a raw split, same σ and beta).

---

### Task 1: Volatility and capture (pure functions)

**Files:**
- Create: `src/indicators/market-risk.ts`
- Test: `tests/market-risk.test.ts`

**Interfaces:**
- Consumes: `LinePoint`, `MovePoint`, `NOISE_PCT`, `adjustedLine` from `src/indicators/risk.ts`.
- Produces:
  - `EWMA_LAMBDA = 0.94`, `EWMA_SEED = 20`, `WEEK = 5`, `HIT_SESSIONS = 500`, `HIT_MIN = 100`, `CAPTURE_SESSIONS = 250`, `CAPTURE_MIN = 120`
  - `ewmaVolatility(line: LinePoint[], lambda?: number): (number | null)[]` — σ (% per day) after each session; same length as `line`
  - `rangeHitRate(line: LinePoint[], sigma: (number | null)[], sessions?: number, min?: number): { inside: number; of: number } | null`
  - `type Capture = { beta: number; up: number; down: number; sessions: number }`
  - `marketCapture(stock: MovePoint[], nifty: MovePoint[], sessions?: number, min?: number): Capture | null`

- [ ] **Step 1: Write the failing tests** (`tests/market-risk.test.ts`)

```ts
import { test, expect, describe } from "bun:test";
import { adjustedLine, type MovePoint } from "../src/indicators/risk";
import { ewmaVolatility, rangeHitRate, marketCapture } from "../src/indicators/market-risk";

const d = (i: number) => new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10);
const lineOf = (pcts: (number | null)[]) => adjustedLine(pcts.map((changePct, i) => ({ date: d(i), changePct })));
const movesOf = (pcts: (number | null)[]): MovePoint[] => pcts.map((changePct, i) => ({ date: d(i), changePct }));

describe("ewmaVolatility (RiskMetrics, λ = 0.94)", () => {
  test("seeds with the sample variance of the first 20 moves, then blends each squared move", () => {
    const alt = Array.from({ length: 20 }, (_, i) => (i % 2 ? -1 : 1));
    const s = ewmaVolatility(lineOf([null, ...alt, 2]));
    expect(s.slice(0, 20).every((x) => x === null)).toBe(true);
    expect(s[20]!).toBeCloseTo(Math.sqrt(20 / 19), 9); // mean 0, 20 squares of 1, ÷ 19
    expect(s[21]!).toBeCloseTo(Math.sqrt(0.94 * (20 / 19) + 0.06 * 4), 9);
  });
  test("a constant move has no volatility", () => {
    expect(ewmaVolatility(lineOf([null, ...Array(40).fill(0.5)])).at(-1)!).toBeCloseTo(0, 9);
  });
  test("doubling every move doubles σ", () => {
    const m = Array.from({ length: 60 }, (_, i) => ((i * 7) % 5) - 2);
    const a = ewmaVolatility(lineOf([null, ...m.map((x) => x * 0.5)])).at(-1)!;
    const b = ewmaVolatility(lineOf([null, ...m])).at(-1)!;
    expect(b / a).toBeCloseTo(2, 2); // ≈: compounding makes % moves not exactly linear
  });
  test("restarts after a gap: no σ until 20 new moves", () => {
    const pcts = [null, ...Array(30).fill(1), null, ...Array(10).fill(1)];
    const s = ewmaVolatility(lineOf(pcts));
    expect(s[30]).not.toBeNull();
    expect(s.slice(31).every((x) => x === null)).toBe(true);
  });
});

describe("rangeHitRate", () => {
  test("judges each week with the σ known at its start (no hindsight)", () => {
    const line = lineOf([null, 1, 1, 1, 1, 1]); // one 5-session stretch, about +5.1%
    // σ at the start says ±0.22% a week: outside. σ at the end (10) would have said inside.
    expect(rangeHitRate(line, [0.1, null, null, null, null, 10], 500, 1)).toEqual({ inside: 0, of: 1 });
  });
  test("uses only the last 500 sessions, and a flat line stays inside a zero range", () => {
    const line = lineOf([null, ...Array(599).fill(0)]);
    expect(rangeHitRate(line, ewmaVolatility(line))).toEqual({ inside: 495, of: 495 });
  });
  test("never measures a week across a gap, and needs 100 stretches", () => {
    const line = lineOf([null, ...Array(60).fill(0), null, ...Array(60).fill(0)]);
    const s = ewmaVolatility(line);
    // σ exists from index 20 (first segment) and 81 (second, after 20 new moves);
    // weeks must end in their own segment: starts 20..55 and 81..116
    expect(rangeHitRate(line, s, 500, 1)!.of).toBe(36 + 36);
    expect(rangeHitRate(line, s)).toBeNull();
  });
});

describe("marketCapture", () => {
  const m = (i: number) => (i === 0 ? null : ((i % 7) - 3) * 0.5); // includes flat days (0)
  const nifty = movesOf(Array.from({ length: 200 }, (_, i) => m(i)));
  test("a stock that moves exactly 2× the NIFTY: beta 2, capture 200% both ways", () => {
    const stock = movesOf(Array.from({ length: 200 }, (_, i) => (m(i) === null ? null : 2 * m(i)!)));
    const c = marketCapture(stock, nifty)!;
    expect(c.beta).toBeCloseTo(2, 9);
    expect(c.up).toBeCloseTo(200, 9);
    expect(c.down).toBeCloseTo(200, 9);
    expect(c.sessions).toBe(199);
  });
  test("the NIFTY against itself: beta 1, 100%", () => {
    expect(marketCapture(nifty, nifty)).toMatchObject({ beta: 1, up: 100, down: 100 });
  });
  test("matches by date: missing stock days are skipped, not shifted", () => {
    const stock = movesOf(Array.from({ length: 200 }, (_, i) => (m(i) === null ? null : 2 * m(i)!))).filter((_, i) => i % 3 !== 0);
    expect(marketCapture(stock, nifty)!.beta).toBeCloseTo(2, 9);
  });
  test("only the last 250 sessions count", () => {
    const n = movesOf(Array.from({ length: 400 }, (_, i) => m(i)));
    const s = movesOf(Array.from({ length: 400 }, (_, i) => (m(i) === null ? null : (i < 150 ? 3 : 2) * m(i)!)));
    expect(marketCapture(s, n)).toMatchObject({ sessions: 250 });
    expect(marketCapture(s, n)!.beta).toBeCloseTo(2, 9);
  });
  test("under 120 sessions: no answer", () => {
    expect(marketCapture(nifty.slice(0, 100), nifty)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bun test tests/market-risk.test.ts`
Expected: FAIL — `Cannot find module '../src/indicators/market-risk'` (or an export-not-found SyntaxError).

- [ ] **Step 3: Implement** (`src/indicators/market-risk.ts`)

```ts
/**
 * Market-risk measures for the Report Card's lights 6–8 (decision 0014):
 * RiskMetrics volatility and its weekly range, capture and beta against the
 * NIFTY 50, and falls in market-crash episodes. All over the adjusted line, so
 * splits, demergers and renames can't fake a move.
 * Spec: docs/superpowers/specs/2026-10-02-report-card-three-lights-design.md.
 */
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
```

- [ ] **Step 4: Run to verify they pass**

Run: `bun test tests/market-risk.test.ts`
Expected: PASS (12 tests). If "the NIFTY against itself" fails on exact `1`/`100`, the cause is float noise in `toMatchObject`'s exact compare: switch that one test to three `toBeCloseTo(…, 9)` lines and ledger a ruling.

- [ ] **Step 5: Commit**

```bash
git checkout -- next-env.d.ts 2>/dev/null
git add src/indicators/market-risk.ts tests/market-risk.test.ts
git commit -m "Add RiskMetrics volatility, its weekly hit rate, and capture/beta vs the NIFTY 50"
```

---

### Task 2: Crash episodes (shared episode finder + falls)

**Files:**
- Create: `src/indicators/episodes.ts`
- Modify: `src/research/forward-returns.ts` (remove `findEpisodes`' body, re-export it), `src/research/cli-forward-returns.ts` (use `MERGE_GAP` from the shared module)
- Modify: `src/indicators/market-risk.ts` (add `crashEpisodes`)
- Test: `tests/market-risk.test.ts` (append), `tests/forward-returns.test.ts` (unchanged; must still pass)

**Interfaces:**
- Consumes: `LinePoint`, `NOISE_PCT` (risk.ts).
- Produces:
  - `src/indicators/episodes.ts`: `findEpisodes(pct: number[], test: (p: number) => boolean, mergeGap: number): number[]` (moved, unchanged), `MERGE_GAP = 10`
  - `market-risk.ts`: `CRASH_BREADTH = 20`, `CRASH_FALL_SESSIONS = 63`, `CRASH_BACK_SESSIONS = 126`,
    `type CrashEpisode = { start: string; stockFall: number; niftyFall: number; back: boolean | null }`,
    `type Crashes = { episodes: CrashEpisode[]; ongoing: string | null; medianStock: number | null; medianNifty: number | null; ratio: number | null; backCount: number; backOf: number }`,
    `crashEpisodes(breadth: { date: string; pctAbove: number }[], stock: LinePoint[], nifty: LinePoint[]): Crashes` (episodes oldest first)

- [ ] **Step 1: Move `findEpisodes`**

Create `src/indicators/episodes.ts` with the function moved verbatim from `src/research/forward-returns.ts` (lines 53–69 today) plus the constant:

```ts
/**
 * Episodes in a daily series: shared by research 0001 and the Report Card's
 * "In crashes" light, so the two can never count crashes differently.
 */

/** Sessions: a dip that recovers for under two weeks is the same episode (research 0001). */
export const MERGE_GAP = 10;

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
```

In `src/research/forward-returns.ts`, delete the function and its comment and add near the top:

```ts
export { findEpisodes } from "../indicators/episodes";
```

In `src/research/cli-forward-returns.ts`, replace `const MERGE_GAP = 10; // sessions: a dip that recovers for under two weeks is the same episode` with `import { MERGE_GAP } from "../indicators/episodes";` (placed with the other imports).

Run: `bun test tests/forward-returns.test.ts && bunx tsc --noEmit`
Expected: PASS, no type errors (behaviour unchanged).

- [ ] **Step 2: Write the failing tests** (append to `tests/market-risk.test.ts`)

```ts
import { crashEpisodes } from "../src/indicators/market-risk";
import type { LinePoint } from "../src/indicators/risk";

describe("crashEpisodes", () => {
  const N = 200;
  const breadthWith = (low: number[]) => Array.from({ length: N }, (_, i) => ({ date: d(i), pctAbove: low.includes(i) ? 10 : 60 }));
  const lineWith = (base: number, dips: Record<number, number>, from = 0, gapAt?: number): LinePoint[] =>
    Array.from({ length: N - from }, (_, k) => {
      const i = k + from;
      return { date: d(i), level: dips[i] ?? base, segment: gapAt !== undefined && i >= gapAt ? 1 : 0 };
    });
  const dip = (s: number, xs: number[]) => Object.fromEntries(xs.map((x, k) => [s + k, x]));
  const stock = lineWith(100, dip(50, [99, 95, 90, 95, 99]));
  const nifty = lineWith(1000, dip(50, [990, 970, 950, 970, 990]));

  test("measures the fall from the start day's close over the next 63 sessions, and 6 months on", () => {
    const c = crashEpisodes(breadthWith([50, 51, 52, 53, 54]), stock, nifty);
    expect(c.episodes).toHaveLength(1);
    expect(c.episodes[0]!.start).toBe(d(50));
    expect(c.episodes[0]!.stockFall).toBeCloseTo((90 / 99 - 1) * 100, 9);
    expect(c.episodes[0]!.niftyFall).toBeCloseTo((950 / 990 - 1) * 100, 9);
    expect(c.episodes[0]!.back).toBe(true);
    expect(c.ratio).toBeCloseTo((90 / 99 - 1) / (950 / 990 - 1), 9);
    expect(c).toMatchObject({ ongoing: null, backCount: 1, backOf: 1 });
  });
  test("weak days within 10 sessions are one crash; further apart, two", () => {
    expect(crashEpisodes(breadthWith([50, 51, 52, 60, 61, 62, 80]), stock, nifty).episodes.map((e) => e.start)).toEqual([d(50), d(80)]);
  });
  test("a crash with under 63 sessions since its start is ongoing, not counted", () => {
    const c = crashEpisodes(breadthWith([180]), stock, nifty);
    expect(c.episodes).toHaveLength(0);
    expect(c.ongoing).toBe(d(180));
    expect(c.ratio).toBeNull();
  });
  test("'back' is unknown until 126 sessions have passed", () => {
    const c = crashEpisodes(breadthWith([100]), stock, nifty);
    expect(c.episodes[0]!.back).toBeNull();
    expect(c).toMatchObject({ backCount: 0, backOf: 0 });
  });
  test("skipped when the stock has no data on the start day, or a gap cuts the window", () => {
    expect(crashEpisodes(breadthWith([50]), lineWith(100, {}, 60), nifty).episodes).toHaveLength(0);
    expect(crashEpisodes(breadthWith([50]), lineWith(100, {}, 0, 70), nifty).episodes).toHaveLength(0);
  });
  test("a stock that never dips below its start has a fall of 0", () => {
    const c = crashEpisodes(breadthWith([50]), lineWith(100, {}), nifty);
    expect(c.episodes[0]!.stockFall).toBe(0);
    expect(c.ratio!).toBeCloseTo(0, 9); // 0 ÷ a negative is −0 in JavaScript; close-to avoids that trap
  });
  test("no ratio when the NIFTY didn't fall", () => {
    expect(crashEpisodes(breadthWith([50]), stock, lineWith(1000, {})).ratio).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `bun test tests/market-risk.test.ts`
Expected: FAIL — `crashEpisodes` not exported.

- [ ] **Step 4: Implement** (append to `src/indicators/market-risk.ts`; add `import { MERGE_GAP, findEpisodes } from "./episodes";` to its imports)

```ts
export const CRASH_BREADTH = 20; // % of NIFTY 50 members above their 200-day SMA
export const CRASH_FALL_SESSIONS = 63; // 3 months
export const CRASH_BACK_SESSIONS = 126; // 6 months

export type CrashEpisode = { start: string; stockFall: number; niftyFall: number; back: boolean | null };
export type Crashes = {
  episodes: CrashEpisode[]; // oldest first
  ongoing: string | null; // the latest start with under 63 sessions since: mentioned, not counted
  medianStock: number | null;
  medianNifty: number | null;
  ratio: number | null; // medianStock ÷ medianNifty; null if the NIFTY's median fall is 0
  backCount: number;
  backOf: number;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length / 2;
  return s.length % 2 ? s[Math.floor(mid)]! : (s[mid - 1]! + s[mid]!) / 2;
};

/** Lowest level in the next 63 sessions vs the start, in % (0 if never below); null across a gap or past the data. */
function fallAfter(line: LinePoint[], i: number | undefined): number | null {
  if (i === undefined) return null;
  const end = i + CRASH_FALL_SESSIONS;
  if (end > line.length - 1 || line[end]!.segment !== line[i]!.segment) return null;
  let low = 0;
  for (let k = i + 1; k <= end; k++) low = Math.min(low, (line[k]!.level / line[i]!.level - 1) * 100);
  return low;
}

function backAfter(line: LinePoint[], i: number): boolean | null {
  const end = i + CRASH_BACK_SESSIONS;
  if (end > line.length - 1 || line[end]!.segment !== line[i]!.segment) return null;
  return (line[end]!.level / line[i]!.level - 1) * 100 >= -NOISE_PCT;
}

/**
 * Each completed market crash (200-SMA breadth < 20%, research 0001's episodes):
 * the stock's and the NIFTY's fall over the next 3 months, and whether the stock
 * was back 6 months on. `breadth` must stop at the chosen date (no hindsight).
 */
export function crashEpisodes(
  breadth: { date: string; pctAbove: number }[],
  stock: LinePoint[],
  nifty: LinePoint[],
): Crashes {
  const starts = findEpisodes(breadth.map((b) => b.pctAbove), (p) => p < CRASH_BREADTH, MERGE_GAP);
  const sIdx = new Map(stock.map((p, i) => [p.date, i]));
  const nIdx = new Map(nifty.map((p, i) => [p.date, i]));
  const episodes: CrashEpisode[] = [];
  let ongoing: string | null = null;
  for (const b of starts) {
    const start = breadth[b]!.date;
    if (b + CRASH_FALL_SESSIONS > breadth.length - 1) { ongoing = start; continue; }
    const si = sIdx.get(start);
    const stockFall = fallAfter(stock, si);
    const niftyFall = fallAfter(nifty, nIdx.get(start));
    if (stockFall === null || niftyFall === null) continue;
    episodes.push({ start, stockFall, niftyFall, back: backAfter(stock, si!) });
  }
  const medianStock = episodes.length ? median(episodes.map((e) => e.stockFall)) : null;
  const medianNifty = episodes.length ? median(episodes.map((e) => e.niftyFall)) : null;
  const ratio = medianStock !== null && medianNifty !== null && medianNifty < -NOISE_PCT ? medianStock / medianNifty : null;
  const known = episodes.filter((e) => e.back !== null);
  return { episodes, ongoing, medianStock, medianNifty, ratio, backCount: known.filter((e) => e.back).length, backOf: known.length };
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `bun test tests/market-risk.test.ts tests/forward-returns.test.ts && bunx tsc --noEmit`
Expected: PASS (19 market-risk tests, forward-returns unchanged), no type errors.

- [ ] **Step 6: Commit**

```bash
git checkout -- next-env.d.ts 2>/dev/null
git add src/indicators/episodes.ts src/indicators/market-risk.ts src/research/forward-returns.ts src/research/cli-forward-returns.ts tests/market-risk.test.ts
git commit -m "Add crash episodes for the Report Card; share research 0001's episode finder"
```

---

### Task 3: The three lights in `stockReport`

**Files:**
- Modify: `src/indicators/risk.ts` (`THRESHOLDS`, `nowVolLight`, `downCaptureLight`)
- Modify: `src/query/stock-report.ts` (type `StockReport` + assembly)
- Test: `tests/risk.test.ts` (lights), `tests/stock-report.test.ts` (report)

**Interfaces:**
- Consumes: Task 1 and 2 exports; `breadthSeries(ma, indexName)` from `src/query/breadth.ts` (returns `{ date: string; pctAbove: number; … }[]`, oldest first).
- Produces (on `StockReport`):
  - `rightNow: { light: Light | null; sigma: number | null; weekPct: number | null; ratio: number | null; hit: { inside: number; of: number } | null }`
  - `badDays: { light: Light | null; capture: Capture | null }`
  - `crashes: { light: Light | null } & Crashes`
  - `THRESHOLDS.nowVol = { green: 1.0, amber: 1.5 }`, `THRESHOLDS.downCapture = { green: 100, amber: 120 }`, `THRESHOLDS.crashMinEpisodes = 3`; `nowVolLight(ratio: number): Light`, `downCaptureLight(pct: number): Light`

- [ ] **Step 1: Write the failing light tests** (append to `tests/risk.test.ts`; add `nowVolLight, downCaptureLight` to its import from `../src/indicators/risk`)

```ts
test("Right now and Bad days lights switch exactly at their cut-offs (0014)", () => {
  expect([nowVolLight(1.0), nowVolLight(1.5), nowVolLight(1.51)]).toEqual(["green", "amber", "red"]);
  expect([downCaptureLight(100), downCaptureLight(120), downCaptureLight(120.1)]).toEqual(["green", "amber", "red"]);
});
```

- [ ] **Step 2: Write the failing report tests** (inside the `describe("stockReport")` block of `tests/stock-report.test.ts`; add the two helpers below `seedIndex`)

```ts
/** Explicit closes; change_pct follows them; sma_200 = 100 (so breadth is "above" when close > 100). */
async function seedCloses(symbol: string, closes: number[], rawClose?: (i: number, c: number) => number) {
  const rows = closes.map((c, i) => ({
    tradeDate: d(i), symbol, close: rawClose ? rawClose(i, c) : c, sma50: 100, sma200: 100, ema200: 100,
    changePct: i === 0 ? null : (c / closes[i - 1]! - 1) * 100, volRatio: 1, turnover: 2e9,
  }));
  for (let i = 0; i < rows.length; i += 500) await db.insert(schema.dailyIndicators).values(rows.slice(i, i + 500));
}
async function seedIndexCloses(closes: number[]) {
  const rows = closes.map((close, i) => ({ tradeDate: d(i), indexName: "Nifty 50", open: null, high: null, low: null, close }));
  for (let i = 0; i < rows.length; i += 500) await db.insert(schema.indexPrices).values(rows.slice(i, i + 500));
}
const member = (symbol: string) => db.insert(schema.indexMembers).values({ indexName: "NIFTY50", symbol, addedOn: "2020-01-01", removedOn: null });
```

```ts
  test("In crashes: three completed episodes count, today's ongoing one is mentioned, light from the median ratio", async () => {
    await member("CR");
    const N = 800, starts = [300, 450, 600, 790];
    const stock = Array.from({ length: N }, () => 110), nifty = Array.from({ length: N }, () => 1100);
    for (const s of starts) {
      [99, 95, 90, 95, 99].forEach((v, k) => { if (s + k < N) stock[s + k] = v; });
      [1089, 1070, 1050, 1070, 1089].forEach((v, k) => { if (s + k < N) nifty[s + k] = v; });
    }
    await seedCloses("CR", stock);
    await seedIndexCloses(nifty);
    const r = await stockReport("CR");
    if (r.kind !== "ok") throw new Error(r.kind);
    const c = r.report.crashes;
    expect(c.episodes.map((e) => e.start)).toEqual([d(300), d(450), d(600)]);
    expect(c.ongoing).toBe(d(790));
    expect(c.ratio!).toBeCloseTo((90 / 99 - 1) / (1050 / 1089 - 1), 9); // 2.54×
    expect(c.light).toBe("red");
    expect(c).toMatchObject({ backCount: 3, backOf: 3 });
  });

  test("a past date inside a crash: only data up to it, the crash is ongoing (no hindsight)", async () => {
    await member("CR");
    const stock = Array.from({ length: 400 }, (_, i) => (i >= 300 && i < 305 ? 95 : 110));
    await seedCloses("CR", stock);
    await seedIndexCloses(stock.map((c) => c * 10));
    const r = await stockReport("CR", d(305));
    if (r.kind !== "ok") throw new Error(r.kind);
    expect(r.report.crashes).toMatchObject({ episodes: [], ongoing: d(300), light: null });
  });

  test("Right now: a steady ±1% stock reads its usual self, a ±2.2% week, and every week inside", async () => {
    await member("ALT");
    await seed("ALT", 400, (i) => (i % 2 ? 1 : -1));
    await seedIndex(400);
    const r = await stockReport("ALT");
    if (r.kind !== "ok") throw new Error(r.kind);
    const n = r.report.rightNow;
    expect(n.light).toBe("green");
    expect(n.ratio!).toBeCloseTo(1, 1);
    expect(n.weekPct!).toBeCloseTo(Math.sqrt(5), 1);
    expect(n.hit).toEqual({ inside: 375, of: 375 }); // weeks start 0..394, but σ only exists from day 20: 375
  });

  test("Bad days: a stock that moves 2× the NIFTY falls 2% when it falls 1%: red", async () => {
    await member("CAP");
    const m = (i: number) => ((i % 7) - 3) * 0.5;
    await seed("CAP", 300, (i) => 2 * m(i));
    const closes = [1000];
    for (let i = 1; i < 300; i++) closes.push(closes[i - 1]! * (1 + m(i) / 100));
    await seedIndexCloses(closes);
    const r = await stockReport("CAP");
    if (r.kind !== "ok") throw new Error(r.kind);
    const b = r.report.badDays;
    expect(b.capture!.beta).toBeCloseTo(2, 6);
    expect(b.capture!.down).toBeCloseTo(200, 6);
    expect(b.light).toBe("red");
  });

  test("a short history gets no new lights, never a guessed colour", async () => {
    await member("NEW");
    await seed("NEW", 100, (i) => (i % 2 ? 1 : -1));
    await seedIndex(100);
    const r = await stockReport("NEW");
    if (r.kind !== "ok") throw new Error(r.kind);
    expect([r.report.rightNow.light, r.report.badDays.light, r.report.crashes.light]).toEqual([null, null, null]);
  });

  test("a raw split (close ÷ 5, flat adjusted move) changes neither σ nor beta", async () => {
    for (const s of ["PLAIN", "SPLIT"]) await member(s);
    const closes = Array.from({ length: 400 }, (_, i) => 100 * (1 + 0.01 * Math.sin(i)));
    await seedCloses("PLAIN", closes);
    await seedCloses("SPLIT", closes, (i, c) => (i >= 200 ? c / 5 : c));
    const idx = [1000];
    for (let i = 1; i < 400; i++) idx.push(idx[i - 1]! * (1 + 0.004 * Math.cos(i)));
    await seedIndexCloses(idx);
    const a = await stockReport("PLAIN"), b = await stockReport("SPLIT");
    if (a.kind !== "ok" || b.kind !== "ok") throw new Error("no report");
    expect(b.report.rightNow.sigma!).toBeCloseTo(a.report.rightNow.sigma!, 9);
    expect(b.report.badDays.capture!.beta).toBeCloseTo(a.report.badDays.capture!.beta, 9);
  });
```

(Why 375: `seed` gives move 0 a null, so the line has 399 moves; σ exists from index 20; weeks start at t = max(0, 400 − 500) = 0 … 394 and are skipped while σ is null, leaving 20 … 394 = 375. Every 5-session move of an alternating ±1% stock is about ±1%, inside ±√5 ≈ ±2.24%.)

- [ ] **Step 3: Run to verify they fail**

Run: `bun test tests/risk.test.ts tests/stock-report.test.ts`
Expected: FAIL — `nowVolLight` not exported; report tests fail on `rightNow`/`badDays`/`crashes` being undefined.

- [ ] **Step 4: Implement the lights** (`src/indicators/risk.ts`)

Replace the `THRESHOLDS` block with:

```ts
/** Every light's cut-off, in one place (decisions 0011 and 0014). */
export const THRESHOLDS = {
  strength: { green: 67, red: 33 }, // percentile among members
  ratio: { green: 1.2, amber: 1.8 }, // × the NIFTY 50 (bumpiness, worst fall, in crashes)
  liquidityCrore: { green: 100, amber: 10 },
  liquiditySessions: 20,
  nowVol: { green: 1.0, amber: 1.5 }, // recent σ ÷ its own last year
  downCapture: { green: 100, amber: 120 }, // % of the NIFTY's fall on its down days
  crashMinEpisodes: 3,
} as const;
```

Add after `liquidityLight`:

```ts
export function nowVolLight(ratio: number): Light {
  return ratio <= THRESHOLDS.nowVol.green ? "green" : ratio <= THRESHOLDS.nowVol.amber ? "amber" : "red";
}

export function downCaptureLight(pct: number): Light {
  return pct <= THRESHOLDS.downCapture.green ? "green" : pct <= THRESHOLDS.downCapture.amber ? "amber" : "red";
}
```

- [ ] **Step 5: Implement the report fields** (`src/query/stock-report.ts`)

Imports: add `VOL_WINDOW, downCaptureLight, nowVolLight,` to the `../indicators/risk` import, and:

```ts
import { WEEK, crashEpisodes, ewmaVolatility, marketCapture, rangeHitRate, type Capture, type Crashes } from "../indicators/market-risk";
import { breadthSeries } from "./breadth";
```

Type `StockReport`, after `liquidity`:

```ts
  rightNow: { light: Light | null; sigma: number | null; weekPct: number | null; ratio: number | null; hit: { inside: number; of: number } | null };
  badDays: { light: Light | null; capture: Capture | null };
  crashes: { light: Light | null } & Crashes;
```

Assembly, after the `// Horizons` block:

```ts
  // Right now: RiskMetrics σ against its own last year (decision 0014)
  const sigmas = ewmaVolatility(line);
  const sigma = sigmas.at(-1) ?? null;
  const yearOfMoves = moves.filter((m) => m.changePct !== null).length >= VOL_WINDOW;
  const nowRatio = yearOfMoves && sigma !== null && dailyVol ? sigma / dailyVol : null;
  const rightNow = {
    light: nowRatio === null ? null : nowVolLight(nowRatio),
    sigma, weekPct: sigma === null ? null : sigma * Math.sqrt(WEEK), ratio: nowRatio,
    hit: rangeHitRate(line, sigmas),
  };

  // Bad days: capture and beta against the NIFTY 50, matched by date
  const capture = marketCapture(moves, niftyMoves);
  const badDays = { light: capture ? downCaptureLight(capture.down) : null, capture };

  // In crashes: breadth up to this session only, so a crash under way isn't counted
  const breadth = (await breadthSeries("sma200", indexName)).filter((b) => b.date <= date);
  const crash = crashEpisodes(breadth, line, niftyLine);
  const crashes = {
    light: crash.ratio !== null && crash.episodes.length >= THRESHOLDS.crashMinEpisodes ? ratioLight(crash.ratio) : null,
    ...crash,
  };
```

And in the returned `report`, after `liquidity: …,` add `rightNow, badDays, crashes,`.

- [ ] **Step 6: Run to verify they pass**

Run: `bun test tests/risk.test.ts tests/stock-report.test.ts && bunx tsc --noEmit`
Expected: PASS; `tsc` will now flag `StockChecks`/`glossary-live` only if they destructure exhaustively (they don't today), so expect no type errors.

- [ ] **Step 7: Commit**

```bash
git checkout -- next-env.d.ts 2>/dev/null
git add src/indicators/risk.ts src/query/stock-report.ts tests/risk.test.ts tests/stock-report.test.ts
git commit -m "Report Card: compute Right now, Bad days and In crashes (decision 0014)"
```

---

### Task 4: On screen — eight lights, the crash table, glossary and live examples

**Files:**
- Modify: `src/components/StockChecks.tsx`
- Create: `src/components/CrashTable.tsx`
- Modify: `src/app/stock/[symbol]/page.tsx`
- Modify: `src/lib/glossary.ts` (3 ids + entries)
- Modify: `src/query/glossary-live.ts`
- Test: `tests/glossary.test.ts`, `tests/glossary-live.test.ts`

**Interfaces:**
- Consumes: `StockReport.rightNow`, `.badDays`, `.crashes` (Task 3); `Term`, `formatDate`, `signed`.
- Produces: `CrashTable({ crashes, className })` default export; glossary ids `"right-now" | "bad-days" | "crash-episodes"`.

- [ ] **Step 1: Write the failing glossary test** (in `tests/glossary.test.ts`, extend "covers the terms on screen")

```ts
    for (const id of ["right-now", "bad-days", "crash-episodes"]) expect(isTermId(id)).toBe(true);
```

Run: `bun test tests/glossary.test.ts` — Expected: FAIL.

- [ ] **Step 2: Add the glossary entries** (`src/lib/glossary.ts`)

In `IDS`, extend the Risk row to:
`"trend-check", "relative-strength", "volatility", "drawdown", "liquidity", "stretches", "adjusted-prices", "right-now", "bad-days", "crash-episodes",`

Add to `GLOSSARY` (after `stretches`):

```ts
  "right-now": {
    id: "right-now", term: "Right now (expected range)", topic: "Risk",
    short: "How jumpy the stock has been lately compared with its usual year, and the range a normal week moves in. Recent days count more than older ones.",
    read: "Green: as calm as usual or calmer. Amber: up to 1.5× jumpier. Red: more than 1.5× jumpier than its usual year.",
    what: "Calm and wild spells come in runs: after a few big days, more big days are likely. This light compares the stock's recent swings with its last year and turns them into a range for a normal week. The card also says how often real weeks stayed inside that range, so you can see whether it fits this stock.",
    calc: {
      plain: "Each day's move is squared and blended into a running average in which yesterday's estimate keeps 94% of the weight (J.P. Morgan's RiskMetrics, 1996). Its square root is today's typical daily move; times √5 gives a week.",
      exact: "σ²(today) = 0.94 × σ²(yesterday) + 0.06 × move²\nweek = σ × √5\nlight = σ ÷ std. dev. of the last 250 moves",
    },
    example: "A typical day of ±1.8% makes a normal week about ±1.8% × 2.24 ≈ ±4.0%: about ±₹400 on ₹10,000. If its usual year was ±1.2% a day, the ratio is 1.5×: amber.",
    mistakes: [
      "Reading the range as a limit. About 1 week in 3 should end outside it, and the worst weeks end far outside.",
      "Thinking calm means safe. Calm spells end, often suddenly.",
    ],
    related: ["volatility", "stretches"],
    seeIt: { label: "Report card", href: "/stock" },
  },
  "bad-days": {
    id: "bad-days", term: "Bad days (down capture and beta)", topic: "Risk",
    short: "How much of the NIFTY 50's falls the stock takes on the market's down days. 120% means that when the NIFTY falls 1%, it usually falls 1.2%.",
    read: "Green: 100% or less. Amber: up to 120%. Red: more than 120%. Beta, shown small, is the same idea over all days.",
    what: "Some stocks drop harder than the market on bad days; others hold up better. Down capture looks only at the days the NIFTY 50 fell, up capture at the days it rose. Beta is the textbook measure over all days: how much the stock moves for each 1% the NIFTY moves.",
    calc: {
      plain: "Over the last 250 sessions: the stock's average move on the NIFTY's down days ÷ the NIFTY's average move on those days. Up capture does the same on up days.",
      exact: "down capture = mean(stock | NIFTY < 0) ÷ mean(NIFTY | NIFTY < 0) × 100\nbeta = Cov(stock, NIFTY) ÷ Var(NIFTY)",
    },
    example: "On the NIFTY's down days it fell 0.8% on average and the stock fell 1.0%: down capture 125%, red. If on up days the NIFTY rose 0.7% and the stock 0.63%, up capture is 90%.",
    mistakes: [
      "Assuming a low beta means the stock can't fall. It describes typical days, not crashes: see In crashes.",
      "Comparing captures measured over different periods.",
    ],
    related: ["crash-episodes", "volatility"],
    seeIt: { label: "Report card", href: "/stock" },
  },
  "crash-episodes": {
    id: "crash-episodes", term: "In crashes (market breaks)", topic: "Risk",
    short: "How far the stock fell in past market crashes compared with the NIFTY 50, and whether it was back 6 months later. A crash: under 20% of NIFTY 50 stocks above their 200-day average.",
    read: "Green: fell up to 1.2× the NIFTY's fall. Amber: up to 1.8×. Red: more. No light with fewer than 3 past crashes.",
    what: "When most of the index breaks down together, you find out which stocks hold up. For each past crash, the card measures the stock's lowest point in the following 3 months against the NIFTY's, and checks where it was 6 months on. A crash still under way isn't counted until 3 months have passed.",
    calc: {
      plain: "A crash starts on a day 200-day breadth falls below 20%; weak days within 10 sessions of each other are one crash (as in research 0001). Fall = the lowest close in the next 63 sessions ÷ the start day's close, minus 1.",
    },
    example: "Three crashes: the stock fell 15%, 9% and 20% (median 15%); the NIFTY fell 10%, 6% and 12% (median 10%). 15 ÷ 10 = 1.5×: amber.",
    mistakes: [
      "Treating a handful of crashes as proof. Since 2020 there have been only about 5; the card always says how many.",
      "Expecting the next crash to look like the last ones.",
    ],
    related: ["breadth", "drawdown"],
    seeIt: { label: "Report card", href: "/stock" },
  },
```

Run: `bun test tests/glossary.test.ts` — Expected: PASS (all completeness checks, short ≤ 220, true minus).

- [ ] **Step 3: Write the failing live-example test** (append inside the last `describe` of `tests/glossary-live.test.ts`)

```ts
  test("the three new lights have live sentences for the showcase stock (or null, never a placeholder)", async () => {
    for (const id of ["right-now", "bad-days", "crash-episodes"] as const) {
      const s = await liveExample(id);
      expect(s === null || !/undefined|NaN|null/.test(s)).toBe(true);
    }
  });
```

and confirm the existing "on an empty database every term returns null" test now iterates the three new ids too (it loops over `GLOSSARY`). Run: `bun test tests/glossary-live.test.ts` — Expected: FAIL on type/exhaustiveness or `undefined` results until Step 4.

- [ ] **Step 4: Live sentences** (`src/query/glossary-live.ts`)

Add `case "right-now": case "bad-days": case "crash-episodes":` to the case list of the `stockReport(SHOWCASE)` group (next to `case "stretches":`), and inside its inner `switch`, before `default:`:

```ts
        case "right-now": return r.rightNow.weekPct === null || r.rightNow.ratio === null ? null
          : `${SHOWCASE} on ${on}: a normal week is up or down about ${r.rightNow.weekPct.toFixed(1)}%, ${r.rightNow.ratio.toFixed(1)}× as jumpy as its usual year.`;
        case "bad-days": { const c = r.badDays.capture; return c === null ? null
          : `Over the last ${c.sessions} sessions, when the NIFTY fell 1% ${SHOWCASE} usually fell ${(c.down / 100).toFixed(1)}%; its beta was ${c.beta.toFixed(2)}.`; }
        case "crash-episodes": { const c = r.crashes; return c.episodes.length === 0 || c.medianStock === null || c.medianNifty === null ? null
          : `${SHOWCASE} fell a median ${Math.abs(c.medianStock).toFixed(0)}% in ${c.episodes.length} market crashes since ${c.episodes[0]!.start.slice(0, 4)} (NIFTY 50: ${Math.abs(c.medianNifty).toFixed(0)}%).`; }
```

Run: `bun test tests/glossary-live.test.ts && bunx tsc --noEmit` — Expected: PASS.

- [ ] **Step 5: The three checks** (`src/components/StockChecks.tsx`)

Update the docstring to "The eight checks…". Before `return [`, add:

```ts
  const n = r.rightNow;
  const rupees = (pctMove: number) => `₹${formatInt(Math.round(pctMove * 100))}`; // on ₹10,000
  const nowSentence =
    n.weekPct === null || n.ratio === null
      ? "Not enough history yet: this needs a year of daily moves."
      : `A normal week: up or down about ${n.weekPct.toFixed(1)}% (about ${rupees(n.weekPct)} on ₹10,000). ${n.ratio <= 1 ? "Calmer" : "Jumpier"} than its usual year.${
          n.hit ? ` In the last 2 years, ${Math.round((n.hit.inside / n.hit.of) * 10)} in 10 week-long stretches stayed inside this range (of ${formatInt(n.hit.of)}).` : ""
        }`;

  const c = r.badDays.capture;
  const badSentence = !c
    ? "Not enough sessions alongside the NIFTY 50 yet."
    : `When the NIFTY falls 1%, it usually falls ${(c.down / 100).toFixed(1)}%. When it rises 1%, this rises ${(c.up / 100).toFixed(1)}%. Beta ${c.beta.toFixed(2)}.`;

  const k = r.crashes;
  const ongoingNote = k.ongoing ? ` A new episode began on ${formatDate(k.ongoing)}; it counts once 3 months have passed.` : "";
  const crashSentence =
    k.episodes.length < THRESHOLDS.crashMinEpisodes || k.medianStock === null || k.medianNifty === null
      ? `${k.episodes.length === 0 ? "No completed market crash in its history yet" : `Only ${k.episodes.length} completed market ${k.episodes.length === 1 ? "crash" : "crashes"} in its history`}: not enough to judge.${ongoingNote}`
      : `In ${k.episodes.length} crashes since ${k.episodes[0]!.start.slice(0, 4)} it fell a median ${abs0(k.medianStock)}% (NIFTY ${abs0(k.medianNifty)}%)${
          k.backOf ? ` and was back 6 months later in ${k.backCount} of ${k.backOf}` : ""
        }.${ongoingNote}`;
```

Add to the imports: `import { THRESHOLDS, type Light } from "@/indicators/risk";` (replacing the existing `import type { Light } …`). Append three entries to the returned array:

```ts
    { label: "Right now", term: "right-now", light: n.light, figure: n.ratio === null ? "—" : `${n.ratio.toFixed(1)}×`, sentence: nowSentence },
    { label: "Bad days", term: "bad-days", light: r.badDays.light, figure: c ? `${c.down.toFixed(0)}%` : "—", sentence: badSentence },
    { label: "In crashes", term: "crash-episodes", light: k.light, figure: k.light === null || k.ratio === null ? "—" : `${k.ratio.toFixed(1)}×`, sentence: crashSentence },
```

Change the grid in `StockChecks` from `"grid gap-4 md:grid-cols-2 xl:grid-cols-5"` to `"grid grid-cols-2 gap-4 lg:grid-cols-4"`.

- [ ] **Step 6: The crash table** (create `src/components/CrashTable.tsx`)

```tsx
import { Card } from "@/components/ui/card";
import Term from "@/components/Term";
import { formatDate, signed } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StockReport } from "@/query/stock-report";

const fall = (v: number) => (Math.abs(v) < 0.05 ? "0%" : `${signed(v, 1)}%`);

/** Each completed market crash: how far the stock fell vs the NIFTY 50, and whether it was back 6 months on. */
export default function CrashTable({ crashes, className }: { crashes: StockReport["crashes"]; className?: string }) {
  const rows = [...crashes.episodes].reverse(); // latest first
  return (
    <Card className={cn("flex flex-col", className)}>
      <div className="border-b px-5 py-3.5">
        <h2 className="text-heading text-foreground"><Term id="crash-episodes">In past market crashes</Term></h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Lowest point in the 3 months after each crash began</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-muted-foreground">No completed market crash in this stock's history yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] tabular-nums">
            <thead>
              <tr className="border-b text-left text-[12px] text-muted-foreground">
                <th className="px-5 py-2 font-medium">Crash began</th>
                <th className="px-3 py-2 text-right font-medium">This stock</th>
                <th className="px-3 py-2 text-right font-medium">NIFTY 50</th>
                <th className="px-5 py-2 text-right font-medium">Back in 6 months</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((e) => (
                <tr key={e.start}>
                  <td className="px-5 py-2 text-foreground">{formatDate(e.start)}</td>
                  <td className="px-3 py-2 text-right text-foreground">{fall(e.stockFall)}</td>
                  <td className="px-3 py-2 text-right text-foreground-2">{fall(e.niftyFall)}</td>
                  <td className="px-5 py-2 text-right text-foreground-2">{e.back === null ? "Not yet" : e.back ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-auto border-t px-5 py-3 text-[12px] text-muted-foreground">
        A crash: fewer than 20% of NIFTY 50 stocks above their 200-day average.
        {crashes.ongoing ? ` One began on ${formatDate(crashes.ongoing)} and counts once 3 months have passed.` : ""}
      </p>
    </Card>
  );
}
```

- [ ] **Step 7: Place it** (`src/app/stock/[symbol]/page.tsx`)

Add `import CrashTable from "@/components/CrashTable";`. Directly after `<RiskCalculator … />` insert:

```tsx
        <CrashTable crashes={r.crashes} />
```

- [ ] **Step 8: Verify and browser-check**

Run: `bunx tsc --noEmit && bun test` — Expected: all pass.

Start the dev server on 3001 (`(bun run dev -- -p 3001 > /tmp/… 2>&1 &)` in the scratchpad) and, with headless Chrome over CDP (scratchpad script as in earlier features; CDP `Input.dispatchKeyEvent` for Enter needs `text: "\r"`):
- `/stock/KOTAKBANK` at 1440 px and 390 px: eight check cards (four per row on desktop, two on phone), the summary counts eight lights, the crash table under the calculator shows the counted crashes latest first and the "One began on 1 Oct 2026…" footer; no horizontal page scroll at 390 px.
- The ⓘ on "Right now", "Bad days", "In crashes" opens with its definition and a "Today:" line.
- `/stock/JIOFIN` (short history): the new lights show "—" and their "Not enough…" sentences.
- `/stock/KOTAKBANK?date=2020-03-23`: "In crashes" says the March 2020 episode counts later; no counted episode from after that date.
- `/learn/right-now`, `/learn/bad-days`, `/learn/crash-episodes` → 200 with "Today in tradeSence" filled.
Save screenshots of the desktop card and the phone view and look at both.

- [ ] **Step 9: Commit**

```bash
git checkout -- next-env.d.ts 2>/dev/null
git add src tests
git commit -m "Report Card: show Right now, Bad days and In crashes, with the crash table and Learn pages"
```

---

### Task 5: Prove it — extend the independent audit

**Files:**
- Modify: `src/audit/report-card.ts`

**Interfaces:**
- Consumes: `stockReport(symbol, date)` fields `rightNow`, `badDays`, `crashes` (Task 3). Must not import anything from `src/indicators/` or `daily_indicators` (independence).

- [ ] **Step 1: Add independent implementations** (after the existing `horizon` function)

```ts
// ── Lights 6–8 (decision 0014), written again from the spec, sharing no app code ──
function ewma(l: Pt[]): (number | null)[] {
  const out: (number | null)[] = []; let v: number | null = null; let buf: number[] = []; let seg = -1;
  l.forEach((p, i) => {
    if (p.seg !== seg) { seg = p.seg; buf = []; v = null; out.push(null); return; }
    const r = (p.level / l[i - 1]!.level - 1) * 100;
    if (v === null) { buf.push(r); if (buf.length === 20) { const m = buf.reduce((a, b) => a + b, 0) / 20; v = buf.reduce((a, b) => a + (b - m) ** 2, 0) / 19; } }
    else v = 0.94 * v + 0.06 * r * r;
    out.push(v === null ? null : Math.sqrt(v));
  });
  return out;
}
function hits(l: Pt[], s: (number | null)[]) {
  let inside = 0, of = 0;
  for (let t = Math.max(0, l.length - 500); t + 5 < l.length; t++) {
    if (s[t] == null || l[t]!.seg !== l[t + 5]!.seg) continue;
    of++; if (Math.abs((l[t + 5]!.level / l[t]!.level - 1) * 100) <= s[t]! * Math.sqrt(5) + 1e-9) inside++;
  }
  return of < 100 ? null : { inside, of };
}
function capture(l: Pt[], nifty: { d: string; c: number }[]) {
  const nm = new Map<string, number>();
  nifty.forEach((x, i) => { if (i > 0) nm.set(x.d, (x.c / nifty[i - 1]!.c - 1) * 100); });
  const pairs: { s: number; m: number }[] = [];
  l.forEach((p, i) => { if (i > 0 && p.seg === l[i - 1]!.seg && nm.has(p.d)) pairs.push({ s: (p.level / l[i - 1]!.level - 1) * 100, m: nm.get(p.d)! }); });
  const w = pairs.slice(-250);
  if (w.length < 120) return null;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const ms = avg(w.map((p) => p.s)), mm = avg(w.map((p) => p.m));
  const beta = w.reduce((a, p) => a + (p.s - ms) * (p.m - mm), 0) / w.reduce((a, p) => a + (p.m - mm) ** 2, 0);
  const up = w.filter((p) => p.m > 1e-9), dn = w.filter((p) => p.m < -1e-9);
  return { beta, up: (avg(up.map((p) => p.s)) / avg(up.map((p) => p.m))) * 100, down: (avg(dn.map((p) => p.s)) / avg(dn.map((p) => p.m))) * 100 };
}

// Breadth rebuilt from raw prices: a member is "above" when its adjusted level is above
// the mean of its last 200 levels in the same segment (= close > stored SMA 200).
const memRows = await db.execute<{ s: string; a: string; r: string | null }>(sql`
  select symbol s, added_on::text a, removed_on::text r from index_members where index_name = 'NIFTY50'`);
const everSyms = [...new Set(memRows.map((x) => x.s))];
const counts = new Map<string, { above: number; total: number }>();
for (const s of everSyms) {
  const l = lines.get(s) ?? (await line(s, today));
  const spans = memRows.filter((x) => x.s === s);
  let sum = 0;
  l.forEach((p, i) => {
    sum += p.level;
    if (i >= 200) sum -= l[i - 200]!.level;
    if (i < 199 || l[i - 199]!.seg !== p.seg) return;
    if (!spans.some((x) => p.d >= x.a && (x.r === null || p.d < x.r))) return;
    const c = counts.get(p.d) ?? { above: 0, total: 0 };
    c.total++; if (p.level > sum / 200) c.above++;
    counts.set(p.d, c);
  });
}
const breadthAll = [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([d, c]) => ({ d, pct: (c.above / c.total) * 100 }));
function crashes(l: Pt[], nifty: { d: string; c: number }[], upto: string) {
  const b = breadthAll.filter((x) => x.d <= upto);
  const starts: number[] = []; let last = -Infinity;
  b.forEach((x, i) => { if (x.pct < 20) { if (i - last - 1 > 10) starts.push(i); last = i; } });
  const si = new Map(l.map((p, i) => [p.d, i])), ni = new Map(nifty.map((x, i) => [x.d, i]));
  const eps: { start: string; s: number; n: number; back: boolean | null }[] = []; let ongoing: string | null = null;
  for (const i of starts) {
    const start = b[i]!.d;
    if (i + 63 > b.length - 1) { ongoing = start; continue; }
    const j = si.get(start), k = ni.get(start);
    if (j === undefined || k === undefined || j + 63 > l.length - 1 || l[j + 63]!.seg !== l[j]!.seg || k + 63 > nifty.length - 1) continue;
    let s = 0, n = 0;
    for (let x = 1; x <= 63; x++) { s = Math.min(s, (l[j + x]!.level / l[j]!.level - 1) * 100); n = Math.min(n, (nifty[k + x]!.c / nifty[k]!.c - 1) * 100); }
    const back = j + 126 <= l.length - 1 && l[j + 126]!.seg === l[j]!.seg ? (l[j + 126]!.level / l[j]!.level - 1) * 100 >= -1e-9 : null;
    eps.push({ start, s, n, back });
  }
  const med = (xs: number[]) => { const v = [...xs].sort((p, q) => p - q), h = v.length / 2; return v.length % 2 ? v[Math.floor(h)]! : (v[h - 1]! + v[h]!) / 2; };
  return { eps, ongoing, ms: eps.length ? med(eps.map((e) => e.s)) : null, mn: eps.length ? med(eps.map((e) => e.n)) : null };
}
```

- [ ] **Step 2: Compare them** (inside the `for (const m of members)` loop, after the `1y p10` comparison). The loop already fetches NIFTY closes; keep their dates by replacing the `nifty` fetch line with:

```ts
  const niftyRows = (await db.execute<{ d: string; c: number }>(sql`select trade_date::text d, close c from index_prices where index_name='Nifty 50' and trade_date between ${l[0]!.d} and ${r.date} order by 1`)).map((x) => ({ d: x.d, c: Number(x.c) }));
  const nifty = niftyRows.map((x) => x.c);
```

then add:

```ts
  const sg = ewma(l), sigma = sg.at(-1) ?? null;
  cmp(m, "rightNow sigma", sigma, r.rightNow.sigma);
  const myVol = vol(moves(l));
  const yearOfMoves = moves(l).filter((x) => x !== null).length >= 250;
  cmp(m, "rightNow ratio", yearOfMoves && sigma !== null && myVol ? sigma / myVol : null, r.rightNow.ratio);
  const h5 = hits(l, sg);
  cmp(m, "rightNow inside", h5?.inside ?? null, r.rightNow.hit?.inside); cmp(m, "rightNow of", h5?.of ?? null, r.rightNow.hit?.of);
  const cp = capture(l, niftyRows);
  cmp(m, "beta", cp?.beta ?? null, r.badDays.capture?.beta); cmp(m, "up capture", cp?.up ?? null, r.badDays.capture?.up); cmp(m, "down capture", cp?.down ?? null, r.badDays.capture?.down);
  const cr = crashes(l, niftyRows, r.date);
  const mine = cr.eps.map((e) => e.start).join(","), app = r.crashes.episodes.map((e) => e.start).join(",");
  if (mine !== app) mism.push(`${m} crash starts: mine=${mine} app=${app}`);
  if (cr.ongoing !== r.crashes.ongoing) mism.push(`${m} crash ongoing: mine=${cr.ongoing} app=${r.crashes.ongoing}`);
  cmp(m, "crash median stock", cr.ms, r.crashes.medianStock); cmp(m, "crash median NIFTY", cr.mn, r.crashes.medianNifty);
  cmp(m, "crash back", cr.eps.filter((e) => e.back).length, r.crashes.backCount);
```

Update the file's header comment: "recomputes the 15 Report Card numbers" → "recomputes every Report Card number (lights 1–8)".

- [ ] **Step 3: Run it on the four audit dates**

Run: `for d in "" 2020-03-23 2022-06-17 2024-06-04; do bun run audit:report-card $d 2>&1 | grep -E "session|✗" | head -8; done`
Expected: `0 mismatches` on all four. (About 1,350 numbers per date.) Any mismatch is a finding: decide whether the app or the audit departs from the spec (the spec is the authority), fix that side test-first if it's the app, ledger it, and record it in decision 0014.

- [ ] **Step 4: Commit**

```bash
git checkout -- next-env.d.ts 2>/dev/null
git add src/audit/report-card.ts
git commit -m "Audit: independently recompute Right now, Bad days and In crashes"
```

---

### Task 6: Outside check and documentation

**Files:**
- Create: `docs/decisions/0014-three-new-lights.md`
- Modify: `docs/decisions/README.md`, `README.md`, `TODO.md`

- [ ] **Step 1: TradingView comparison.** Using the TradingView MCP (`mcp-tv-get-symbol-data` for `NSE:KOTAKBANK`, `NSE:RELIANCE`, `NSE:INFY`), find TradingView's beta field and its definition (window, daily vs weekly, against which index). Compare with `stockReport(sym).report.badDays.capture.beta` (print with a one-line bun script). Record the numbers and the explanation of any difference (different window, weekly returns, a different benchmark). Do not claim "matches TradingView" unless the numbers agree within the stated definition difference (memory rule).

- [ ] **Step 2: Decision 0014** in the decision-log format, plain language: Problem (three beginner questions), Options (lights vs plain numbers vs merged into the calculator; down capture vs beta for the Bad days light), Decision (the three lights with every cut-off and its reason, from `THRESHOLDS`), Why, Problems met while building (each ledger ruling), Checks (tests, audit 0 mismatches on four dates with the number count, TradingView, browser), What the numbers don't prove (≈5 crashes; the range assumes nothing about fat tails, which is why the hit rate is shown), Revisit when (a crash completes: the episode count changes; whole-market version).

- [ ] **Step 3:** Row in `docs/decisions/README.md`. README function reference: a `src/indicators/market-risk.ts` table (`ewmaVolatility`, `rangeHitRate`, `marketCapture`, `crashEpisodes`) and `src/indicators/episodes.ts` (`findEpisodes`, `MERGE_GAP`); the Report Card row mentions eight lights. TODO: Done row "Report Card lights 6–8: 0014".

- [ ] **Step 4:** `bunx tsc --noEmit && bun test`, then commit:

```bash
git checkout -- next-env.d.ts 2>/dev/null
git add docs README.md TODO.md
git commit -m "Document the three new Report Card lights (decision 0014)"
```
