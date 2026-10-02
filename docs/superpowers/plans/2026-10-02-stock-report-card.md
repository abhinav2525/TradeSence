# Stock Report Card + Risk Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/stock/[symbol]` page that tells a beginner, in plain language with traffic lights, how risky one NIFTY 50 member is and what a bad stretch would cost in rupees.

**Architecture:** Everything is derived per request from `daily_indicators.change_pct` (the stored, split/demerger-adjusted, rename-joined daily move), chained into an adjusted price line. Pure functions in `src/indicators/risk.ts` compute every metric; `src/query/stock-report.ts` loads data and assembles a `StockReport`; the page renders it, and a client `RiskCalculator` applies the reader's amount. One new stored column, `daily_indicators.turnover`.

**Tech Stack:** Bun, TypeScript, Next.js 16 (App Router, server components, `searchParams` is a Promise), Drizzle + Postgres, Recharts via shadcn `chart.tsx`, Tailwind v4 tokens, `bun test`.

**Spec:** `docs/superpowers/specs/2026-10-02-stock-report-card-design.md`

## Global Constraints

- TDD: write the failing test, watch it fail, then implement (CLAUDE.md).
- `bun test` always runs against `tradesence_test`; run from the repo root.
- No new `sql.raw`. All SQL is parameterised; pick moving-average columns in TypeScript.
- Every search param is checked against a fixed set of strict comparisons with a default, as on every page (`isMaKind` pattern).
- Nothing spans a hole in the data: a null `change_pct` starts a new segment (CLAUDE.md gap rule; `src/indicators/gaps.ts`).
- No look-ahead: only rows on or before the chosen session are used.
- Lights: Trend 🟢 above both SMAs · 🟡 above one · 🔴 below both. Strength 🟢 ≥ 67th · 🟡 34th–66th · 🔴 ≤ 33rd percentile. Bumpiness and Worst fall 🟢 ≤ 1.2× · 🟡 ≤ 1.8× · 🔴 > 1.8× the NIFTY 50. Liquidity 🟢 ≥ ₹100 cr · 🟡 ≥ ₹10 cr · 🔴 < ₹10 cr median daily turnover (last 20 sessions).
- Horizons: `1w` = 5, `1m` = 21, `3m` = 63, `1y` = 250 sessions; default `1m`. A horizon needs ≥ 3 × its sessions of history.
- Volatility window: last 250 daily moves, needing ≥ 60.
- **No buy/sell verdict and no single score.** The summary shows counts of lights only.
- Copy: true minus "−", Indian grouping, dates "29 Sep 2026", sentence case, the caveat "Past ranges, not a forecast. Losses can be larger than anything in this history."
- Design system tokens only (`text-up`, `bg-card`, …), never hex. Charts: no animation, tooltip on every chart, legend only when colour carries meaning.
- Every problem met gets a `docs/decisions/` entry (memory: document-every-problem).

## Review Focus

1. **A split or demerger inside the window** (KOTAKBANK Jan 2026, TMPV Oct 2025) must not appear as a drawdown, a bad month or a price-chart cliff. Pinned in Task 4 (DB test, split day) and Task 2 (line from `change_pct`).
2. **A renamed stock** (ETERNAL, history under ZOMATO) must show its full history, events and turnover from before the rename. Pinned in Task 1 (turnover across a rename) and Task 4 (events across lineage).
3. **A stock with short history** (new listing: fewer than 3×250 sessions) must say "not enough history yet" for `1y` instead of computing from a handful of windows. Pinned in Task 3.
4. **A symbol in the URL that isn't a supported stock, or has odd characters** (`/stock/foo`, `/stock/M&M`, `/stock/../x`) must 404 or resolve correctly, never error or reach SQL raw. Pinned in Task 4 (`stockReport` returns `{ kind: "unknown" }`) and Task 5 (the page validates the symbol, calls `notFound()`, and the curl check covers `M&M`, `BAJAJ-AUTO`, `nope` and a path-traversal attempt).
5. **A date after the stock left the index** (YESBANK in 2026) must still show the card with "Left the NIFTY 50 on …", ranking Strength against the members on that date. Pinned in Task 4.

---

### Task 1: Store daily turnover in `daily_indicators`

**Files:**
- Modify: `src/db/schema.ts` (dailyIndicators: add `turnover`)
- Modify: `src/indicators/compute.ts` (select `turnover`, write it)
- Create: `drizzle/0006_*.sql` via `bun run db:generate`
- Test: `tests/compute.test.ts`

**Interfaces:**
- Produces: `daily_indicators.turnover double precision` (₹ traded that session, on the rename-joined series; null only if absent). Drizzle field `turnover`.

- [ ] **Step 1: Write the failing test** (append to `tests/compute.test.ts`)

```ts
describe("computeIndicators: turnover", () => {
  beforeEach(async () => {
    await db.delete(schema.dailyIndicators);
    await db.delete(schema.dailyPrices);
    await db.delete(schema.indexMembers);
    await db.delete(schema.corporateActions);
    await db.delete(schema.symbolChanges);
  });

  test("is stored per session and joined across a rename", async () => {
    const rows = synthetic("X", 4).map((r, i) => ({ ...r, symbol: i < 2 ? "OLDT" : "NEWT", turnover: 1e9 + i }));
    await db.insert(schema.dailyPrices).values(rows);
    await db.insert(schema.indexMembers).values({ indexName: "NIFTY50", symbol: "NEWT", addedOn: "2020-01-01", removedOn: null });
    await db.insert(schema.symbolChanges).values({ oldSymbol: "OLDT", newSymbol: "NEWT", changedOn: rows[2]!.tradeDate, company: null });
    await computeIndicators();
    const got = (await db.select().from(schema.dailyIndicators).where(eq(schema.dailyIndicators.symbol, "NEWT")))
      .sort((a, b) => (a.tradeDate < b.tradeDate ? -1 : 1))
      .map((r) => r.turnover);
    expect(got).toEqual([1e9, 1e9 + 1, 1e9 + 2, 1e9 + 3]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `bun test tests/compute.test.ts --test-name-pattern "turnover"`
Expected: FAIL (TypeScript/field `turnover` missing on the select result, or `undefined` values).

- [ ] **Step 3: Implement**

In `src/db/schema.ts`, inside `dailyIndicators` after `volRatio`:

```ts
    // ₹ traded that session (bhavcopy turnover, both formats in rupees), on the
    // rename-joined series. For the Report Card's liquidity check (decision 0011).
    turnover: doublePrecision("turnover"),
```

In `src/indicators/compute.ts`, extend the price query type and select:

```ts
    const prices = await db.execute<{ trade_date: string; open: number; close: number; volume: number; turnover: number }>(
      sql`select trade_date, open, close, volume, turnover
```

In the `rows` mapping add `turnover: Number(prices[i]!.turnover),` and in the upsert `set` add `turnover: sql\`excluded.turnover\`,`.

Then:

```bash
bun run db:generate
bun run db:migrate
DATABASE_URL=postgres://localhost:5432/tradesence_test bun run db:migrate
```

Expected migration: `ALTER TABLE "daily_indicators" ADD COLUMN "turnover" double precision;`

- [ ] **Step 4: Run tests**

Run: `bun test tests/compute.test.ts` → all PASS. Then `bun run indicators` (fills the dev DB).

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/indicators/compute.ts drizzle/ tests/compute.test.ts
git commit -m "Store daily turnover in daily_indicators for the Report Card"
```

---

### Task 2: Adjusted line and drawdowns (`risk.ts`, part 1)

**Files:**
- Create: `src/indicators/risk.ts`
- Test: `tests/risk.test.ts`

**Interfaces:**
- Produces:
  - `type MovePoint = { date: string; changePct: number | null }`
  - `type LinePoint = { date: string; level: number; segment: number }`
  - `adjustedLine(points: MovePoint[]): LinePoint[]` — level starts at 100; each point multiplies by `1 + changePct/100`; a null `changePct` (after the first point) starts a new `segment` (level carries on unchanged).
  - `type Drawdown = { depthPct: number; peakDate: string; troughDate: string; recoveryDate: string | null; sessionsToRecover: number | null }`
  - `drawdownSeries(line: LinePoint[]): { date: string; pct: number }[]` — % below the running peak (≤ 0); the peak resets at a segment start.
  - `worstDrawdown(line: LinePoint[]): Drawdown | null` — deepest trough; recovery = first later session in the same segment at or above the peak level.
  - `currentDrawdownPct(line: LinePoint[]): number | null` — last value of `drawdownSeries`.
  - `closesToMoves(rows: { date: string; close: number }[]): MovePoint[]` — for the NIFTY 50 index: first move null, then % change between consecutive closes.

- [ ] **Step 1: Write the failing tests** (`tests/risk.test.ts`)

```ts
import { test, expect, describe } from "bun:test";
import { adjustedLine, drawdownSeries, worstDrawdown, currentDrawdownPct, closesToMoves } from "../src/indicators/risk";

const d = (i: number) => new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10);
const moves = (pcts: (number | null)[]) => pcts.map((changePct, i) => ({ date: d(i), changePct }));

describe("adjustedLine", () => {
  test("chains daily moves from 100", () => {
    const line = adjustedLine(moves([null, 10, -10]));
    expect(line.map((p) => p.level)).toEqual([100, 110, 99]);
    expect(line.map((p) => p.segment)).toEqual([0, 0, 0]);
  });

  test("a missing move starts a new segment and keeps the level", () => {
    const line = adjustedLine(moves([null, 10, null, 10]));
    expect(line.map((p) => p.segment)).toEqual([0, 0, 1, 1]);
    expect(line[2]!.level).toBe(110);
    expect(line[3]!.level).toBeCloseTo(121, 9);
  });
});

describe("drawdowns", () => {
  test("worst fall with peak, trough and recovery", () => {
    // 100 → 120 (peak) → 60 (−50%) → 120 again (recovered)
    const line = adjustedLine(moves([null, 20, -25, -33.3333333333, 100]));
    const w = worstDrawdown(line)!;
    expect(w.depthPct).toBeCloseTo(-50, 6);
    expect(w).toMatchObject({ peakDate: d(1), troughDate: d(3), recoveryDate: d(4), sessionsToRecover: 3 });
  });

  test("not recovered yet", () => {
    const w = worstDrawdown(adjustedLine(moves([null, 20, -50])))!;
    expect(w).toMatchObject({ recoveryDate: null, sessionsToRecover: null });
    expect(currentDrawdownPct(adjustedLine(moves([null, 20, -50])))!).toBeCloseTo(-50, 9);
  });

  test("the running peak resets at a segment break", () => {
    const s = drawdownSeries(adjustedLine(moves([null, 50, null, -10])));
    expect(s.map((p) => Math.round(p.pct))).toEqual([0, 0, 0, -10]);
  });

  test("no history, no drawdown", () => {
    expect(worstDrawdown([])).toBeNull();
  });
});

test("closesToMoves turns index closes into daily moves", () => {
  const m = closesToMoves([{ date: d(0), close: 100 }, { date: d(1), close: 105 }]);
  expect(m[0]).toEqual({ date: d(0), changePct: null });
  expect(m[1]!.changePct!).toBeCloseTo(5, 9);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `bun test tests/risk.test.ts`
Expected: FAIL, "Cannot find module '../src/indicators/risk'".

- [ ] **Step 3: Implement** (`src/indicators/risk.ts`)

```ts
/**
 * Risk measures for the Stock Report Card, all from the adjusted daily moves
 * (daily_indicators.change_pct), so splits, demergers and renames can't fake a
 * fall. Spec: docs/superpowers/specs/2026-10-02-stock-report-card-design.md;
 * thresholds and why: docs/decisions/0011-stock-report-card.md.
 */

export type MovePoint = { date: string; changePct: number | null };
export type LinePoint = { date: string; level: number; segment: number };

/** Chains daily moves into a price line starting at 100. A missing move starts a new segment. */
export function adjustedLine(points: MovePoint[]): LinePoint[] {
  const out: LinePoint[] = [];
  let level = 100;
  let segment = 0;
  points.forEach((p, i) => {
    if (i > 0) {
      if (p.changePct === null) segment += 1;
      else level *= 1 + p.changePct / 100;
    }
    out.push({ date: p.date, level, segment });
  });
  return out;
}

/** % below the running peak (0 at a new high). The peak resets at each segment start. */
export function drawdownSeries(line: LinePoint[]): { date: string; pct: number }[] {
  let peak = -Infinity;
  let seg = -1;
  return line.map((p) => {
    if (p.segment !== seg) { seg = p.segment; peak = p.level; }
    peak = Math.max(peak, p.level);
    return { date: p.date, pct: (p.level / peak - 1) * 100 };
  });
}

export type Drawdown = {
  depthPct: number;
  peakDate: string;
  troughDate: string;
  recoveryDate: string | null;
  sessionsToRecover: number | null;
};

/** The deepest fall from a peak, and when (if ever) the line got back to that peak. */
export function worstDrawdown(line: LinePoint[]): Drawdown | null {
  if (line.length === 0) return null;
  let best: { depth: number; peakI: number; troughI: number } | null = null;
  let peakI = 0;
  for (let i = 0; i < line.length; i++) {
    if (i === 0 || line[i]!.segment !== line[i - 1]!.segment || line[i]!.level >= line[peakI]!.level) peakI = i;
    const depth = (line[i]!.level / line[peakI]!.level - 1) * 100;
    if (!best || depth < best.depth) best = { depth, peakI, troughI: i };
  }
  if (!best || best.depth >= 0) {
    return { depthPct: 0, peakDate: line[0]!.date, troughDate: line[0]!.date, recoveryDate: null, sessionsToRecover: null };
  }
  const peak = line[best.peakI]!;
  let recoverI: number | null = null;
  for (let i = best.troughI + 1; i < line.length; i++) {
    if (line[i]!.segment !== peak.segment) break;
    if (line[i]!.level >= peak.level) { recoverI = i; break; }
  }
  return {
    depthPct: best.depth,
    peakDate: peak.date,
    troughDate: line[best.troughI]!.date,
    recoveryDate: recoverI === null ? null : line[recoverI]!.date,
    // counted from the peak: "how long until it was back where it started falling"
    sessionsToRecover: recoverI === null ? null : recoverI - best.peakI,
  };
}

export function currentDrawdownPct(line: LinePoint[]): number | null {
  return drawdownSeries(line).at(-1)?.pct ?? null;
}

/** Index closes → daily moves, so the NIFTY 50 goes through the same functions as a stock. */
export function closesToMoves(rows: { date: string; close: number }[]): MovePoint[] {
  return rows.map((r, i) => ({ date: r.date, changePct: i === 0 ? null : (r.close / rows[i - 1]!.close - 1) * 100 }));
}
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/risk.test.ts` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/indicators/risk.ts tests/risk.test.ts
git commit -m "Add adjusted line and drawdown measures for the Report Card"
```

---

### Task 3: Horizons, volatility, returns and lights (`risk.ts`, part 2)

**Files:**
- Modify: `src/indicators/risk.ts`
- Test: `tests/risk.test.ts`

**Interfaces:**
- Consumes: `LinePoint`, `adjustedLine` (Task 2).
- Produces:
  - `const HORIZONS = { "1w": 5, "1m": 21, "3m": 63, "1y": 250 } as const; type HorizonKey = keyof typeof HORIZONS`
  - `type Bin = { from: number; to: number; count: number }`
  - `type HorizonStats = { sessions: number; windows: number; p10: number; median: number; worst: number; worstStart: string; shareNegative: number; bins: Bin[] }`
  - `horizonStats(line: LinePoint[], sessions: number): HorizonStats | null` — every window of `sessions` within one segment; null if `line.length < 3 * sessions` or no windows.
  - `periodReturn(line: LinePoint[], sessions: number): number | null` — % from `sessions` back to the last point, same segment.
  - `dailyVolatility(moves: (number | null)[]): number | null` — sample std. dev. of the last 250 non-null moves; null under 60.
  - `percentRank(value: number, all: number[]): number` — % of `all` ≤ `value` (0–100).
  - `type Light = "green" | "amber" | "red"`
  - `THRESHOLDS` object; `trendLight(close, sma50, sma200)`, `strengthLight(pct)`, `ratioLight(ratio)`, `liquidityLight(crore)`.

- [ ] **Step 1: Write the failing tests** (append to `tests/risk.test.ts`)

```ts
import {
  horizonStats, periodReturn, dailyVolatility, percentRank,
  trendLight, strengthLight, ratioLight, liquidityLight, HORIZONS,
} from "../src/indicators/risk";

describe("horizonStats", () => {
  test("rolling windows: 10th percentile, worst, share negative, median", () => {
    // 30 sessions alternating +1% / −1%: every 2-session window is ≈ −0.01%
    const pts = Array.from({ length: 30 }, (_, i) => (i === 0 ? null : i % 2 ? 1 : -1));
    const s = horizonStats(adjustedLine(moves(pts)), 2)!;
    expect(s.windows).toBe(28);
    expect(s.shareNegative).toBe(100);
    expect(s.worst).toBeCloseTo(-0.01, 4);
    expect(s.bins.reduce((n, b) => n + b.count, 0)).toBe(28);
  });

  test("needs at least three horizons of history", () => {
    expect(horizonStats(adjustedLine(moves(new Array(14).fill(1))), 5)).toBeNull();
    expect(horizonStats(adjustedLine(moves(new Array(15).fill(1))), 5)).not.toBeNull();
  });

  test("a window never spans a segment break", () => {
    const pts = [null, 10, 10, null, 10, 10];
    const s = horizonStats(adjustedLine(moves([...pts, ...pts])), 2)!;
    expect(s.worst).toBeCloseTo(21, 6); // only same-segment windows (two +10% days)
  });

  test("HORIZONS are the agreed session counts", () => {
    expect(HORIZONS).toEqual({ "1w": 5, "1m": 21, "3m": 63, "1y": 250 });
  });
});

test("periodReturn", () => {
  const line = adjustedLine(moves([null, 10, 10]));
  expect(periodReturn(line, 2)!).toBeCloseTo(21, 9);
  expect(periodReturn(line, 5)).toBeNull();
});

test("dailyVolatility needs 60 moves and uses the last 250", () => {
  expect(dailyVolatility(new Array(59).fill(1))).toBeNull();
  const v = dailyVolatility([...new Array(300).fill(10), ...Array.from({ length: 250 }, (_, i) => (i % 2 ? 1 : -1))])!;
  expect(v).toBeCloseTo(1.002, 3); // the old ±10s are outside the window
});

test("percentRank", () => {
  expect(percentRank(3, [1, 2, 3, 4])).toBe(75);
});

describe("lights", () => {
  test("trend", () => {
    expect(trendLight(110, 100, 100)).toBe("green");
    expect(trendLight(110, 120, 100)).toBe("amber");
    expect(trendLight(90, 100, 100)).toBe("red");
    expect(trendLight(90, null, 100)).toBeNull();
  });
  test("strength boundaries", () => {
    expect([67, 66, 34, 33].map(strengthLight)).toEqual(["green", "amber", "amber", "red"]);
  });
  test("ratio boundaries (bumpiness, worst fall)", () => {
    expect([1.2, 1.21, 1.8, 1.81].map(ratioLight)).toEqual(["green", "amber", "amber", "red"]);
  });
  test("liquidity boundaries in ₹ crore", () => {
    expect([100, 99.9, 10, 9.9].map(liquidityLight)).toEqual(["green", "amber", "amber", "red"]);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `bun test tests/risk.test.ts` → FAIL ("Export named 'horizonStats' not found").

- [ ] **Step 3: Implement** (append to `src/indicators/risk.ts`)

```ts
export const HORIZONS = { "1w": 5, "1m": 21, "3m": 63, "1y": 250 } as const;
export type HorizonKey = keyof typeof HORIZONS;

export type Bin = { from: number; to: number; count: number };
export type HorizonStats = {
  sessions: number;
  windows: number;
  p10: number;
  median: number;
  worst: number;
  worstStart: string;
  shareNegative: number;
  bins: Bin[];
};

const quantile = (sorted: number[], q: number) => {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  return sorted[lo]! + (sorted[Math.ceil(pos)]! - sorted[lo]!) * (pos - lo);
};

/** Twenty equal-width bins over the observed range, for the calculator's histogram. */
function binsOf(values: number[]): Bin[] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const width = (hi - lo) / 20 || 1;
  const bins = Array.from({ length: 20 }, (_, i) => ({ from: lo + i * width, to: lo + (i + 1) * width, count: 0 }));
  for (const v of values) bins[Math.min(19, Math.floor((v - lo) / width))]!.count += 1;
  return bins;
}

/**
 * Every `sessions`-long stretch in the history (overlapping), as % returns.
 * Null with less than three horizons of history: too few stretches to say
 * what "typical" looks like.
 */
export function horizonStats(line: LinePoint[], sessions: number): HorizonStats | null {
  if (line.length < 3 * sessions) return null;
  const rets: { r: number; start: string }[] = [];
  for (let i = sessions; i < line.length; i++) {
    const a = line[i - sessions]!;
    const b = line[i]!;
    if (a.segment !== b.segment) continue;
    rets.push({ r: (b.level / a.level - 1) * 100, start: a.date });
  }
  if (rets.length === 0) return null;
  const sorted = rets.map((x) => x.r).sort((x, y) => x - y);
  const worst = rets.reduce((w, x) => (x.r < w.r ? x : w));
  return {
    sessions,
    windows: rets.length,
    p10: quantile(sorted, 0.1),
    median: quantile(sorted, 0.5),
    worst: worst.r,
    worstStart: worst.start,
    shareNegative: (rets.filter((x) => x.r < 0).length / rets.length) * 100,
    bins: binsOf(sorted),
  };
}

/** % change over the last `sessions` sessions, if they're all in one segment. */
export function periodReturn(line: LinePoint[], sessions: number): number | null {
  const end = line.at(-1);
  const start = line.at(-1 - sessions);
  if (!end || !start || start.segment !== end.segment) return null;
  return (end.level / start.level - 1) * 100;
}

export const VOL_WINDOW = 250;
export const VOL_MIN = 60;

/** Sample std. dev. of the last 250 daily moves (%); null with under 60. */
export function dailyVolatility(moves: (number | null)[]): number | null {
  const xs = moves.filter((m): m is number => m !== null).slice(-VOL_WINDOW);
  if (xs.length < VOL_MIN) return null;
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1));
}

/** % of `all` at or below `value`. */
export function percentRank(value: number, all: number[]): number {
  return all.length === 0 ? 0 : (all.filter((x) => x <= value).length / all.length) * 100;
}

export type Light = "green" | "amber" | "red";

/** Every light's cut-off, in one place (decision 0011). */
export const THRESHOLDS = {
  strength: { green: 67, red: 33 }, // percentile among members
  ratio: { green: 1.2, amber: 1.8 }, // × the NIFTY 50 (bumpiness, worst fall)
  liquidityCrore: { green: 100, amber: 10 },
  liquiditySessions: 20,
} as const;

export function trendLight(close: number, sma50: number | null, sma200: number | null): Light | null {
  if (sma50 === null || sma200 === null) return null;
  const n = Number(close > sma50) + Number(close > sma200);
  return n === 2 ? "green" : n === 1 ? "amber" : "red";
}

export function strengthLight(pct: number): Light {
  return pct >= THRESHOLDS.strength.green ? "green" : pct <= THRESHOLDS.strength.red ? "red" : "amber";
}

export function ratioLight(ratio: number): Light {
  return ratio <= THRESHOLDS.ratio.green ? "green" : ratio <= THRESHOLDS.ratio.amber ? "amber" : "red";
}

export function liquidityLight(crore: number): Light {
  return crore >= THRESHOLDS.liquidityCrore.green ? "green" : crore >= THRESHOLDS.liquidityCrore.amber ? "amber" : "red";
}
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/risk.test.ts` → all PASS. If the "segment break" test's expected 21 fails, print `s` and confirm only same-segment windows were counted; the fix is in `horizonStats`, not the test.

- [ ] **Step 5: Commit**

```bash
git add src/indicators/risk.ts tests/risk.test.ts
git commit -m "Add horizon, volatility, return and light measures for the Report Card"
```

---

### Task 4: Assemble a `StockReport` (`src/query/stock-report.ts`)

**Files:**
- Create: `src/query/stock-report.ts`
- Test: `tests/stock-report.test.ts`

**Interfaces:**
- Consumes: everything in `risk.ts` (Tasks 2–3); `symbolLineage` from `src/ingest/symbol-changes.ts` (`(symbol, changes) => { symbol, from, to }[]`).
- Produces:

```ts
export type HorizonPair = { stock: HorizonStats | null; nifty: HorizonStats | null };
export type StockReport = {
  symbol: string;
  date: string;              // the session shown
  requested: string | null;  // what the URL asked for
  snapped: boolean;
  prev: string | null;
  next: string | null;
  firstDate: string;         // first session in the stock's history
  membership: { addedOn: string; removedOn: string | null }[];
  close: number;
  trend: { light: Light | null; sma50: number | null; sma200: number | null; side200: "above" | "below" | null; sessions200: number };
  strength: { light: Light | null; percentile: number | null; ret3m: number | null; ret6m: number | null; ret12m: number | null; nifty6m: number | null };
  bumpiness: { light: Light | null; dailyVol: number | null; niftyVol: number | null; ratio: number | null };
  worstFall: { light: Light | null; stock: Drawdown | null; nifty: Drawdown | null; ratio: number | null; currentPct: number | null };
  liquidity: { light: Light | null; medianCrore: number | null };
  horizons: Record<HorizonKey, HorizonPair>;
  price: { date: string; close: number; sma200: number | null }[]; // adjusted to the shown session's rupees
  drawdown: { date: string; pct: number }[];
  events: { date: string; kind: string; text: string }[];
  dividends12m: number;
};
export type StockReportResult =
  | { kind: "unknown" }                                           // never a supported symbol → the page 404s
  | { kind: "no-data"; symbol: string; firstDate: string | null } // no session on or before the date
  | { kind: "ok"; report: StockReport };
export async function supportedStocks(indexName?: string): Promise<{ symbol: string; current: boolean }[]>;
export async function stockReport(symbol: string, dateIso?: string, indexName?: string): Promise<StockReportResult>;
```

- [ ] **Step 1: Write the failing tests** (`tests/stock-report.test.ts`)

```ts
import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { stockReport, supportedStocks } from "../src/query/stock-report";

const d = (i: number) => new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10);

async function reset() {
  for (const t of [schema.dailyIndicators, schema.indexMembers, schema.indexPrices, schema.corporateActions, schema.symbolChanges]) {
    await db.delete(t);
  }
}

/** n sessions for a symbol; moves from `move(i)`; close follows the moves from 100. */
async function seed(symbol: string, n: number, move: (i: number) => number | null, extra: Partial<{ turnover: number }> = {}) {
  let close = 100;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const m = i === 0 ? null : move(i);
    if (m !== null) close *= 1 + m / 100;
    rows.push({ tradeDate: d(i), symbol, close, sma50: 100, sma200: 100, ema200: 100, changePct: m, volRatio: 1, turnover: extra.turnover ?? 2e9 });
  }
  for (let i = 0; i < rows.length; i += 500) await db.insert(schema.dailyIndicators).values(rows.slice(i, i + 500));
}

async function seedIndex(n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({ tradeDate: d(i), indexName: "Nifty 50", open: null, high: null, low: null, close: 1000 + i }));
  for (let i = 0; i < rows.length; i += 500) await db.insert(schema.indexPrices).values(rows.slice(i, i + 500));
}

describe("stockReport", () => {
  beforeEach(reset);

  test("an unknown symbol is 'unknown' (the page 404s)", async () => {
    expect((await stockReport("NOPE")).kind).toBe("unknown");
  });

  test("a date before the stock's history is 'no-data'", async () => {
    await db.insert(schema.indexMembers).values({ indexName: "NIFTY50", symbol: "AAA", addedOn: "2020-01-01", removedOn: null });
    await seed("AAA", 10, () => 1);
    await seedIndex(10);
    expect(await stockReport("AAA", "2019-06-01")).toMatchObject({ kind: "no-data", firstDate: d(0) });
  });

  test("builds every check; a 1:5 split day (move ≈ 0 in change_pct) creates no drawdown", async () => {
    await db.insert(schema.indexMembers).values({ indexName: "NIFTY50", symbol: "AAA", addedOn: "2020-01-01", removedOn: null });
    // steady +0.1%/day; the split is invisible in change_pct by design (decision 0008)
    await seed("AAA", 800, () => 0.1);
    await seedIndex(800);
    const r = await stockReport("AAA");
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.report.worstFall.stock!.depthPct).toBeCloseTo(0, 9);
    expect(r.report.liquidity).toMatchObject({ light: "green", medianCrore: 200 });
    expect(r.report.horizons["1y"].stock).not.toBeNull();
    expect(r.report.horizons["1m"].stock!.shareNegative).toBe(0);
  });

  test("short history: 1y is 'not enough' (null) while 1w works", async () => {
    await db.insert(schema.indexMembers).values({ indexName: "NIFTY50", symbol: "NEW", addedOn: "2020-01-01", removedOn: null });
    await seed("NEW", 100, (i) => (i % 2 ? 1 : -1));
    await seedIndex(100);
    const r = await stockReport("NEW");
    if (r.kind !== "ok") throw new Error(r.kind);
    expect(r.report.horizons["1y"].stock).toBeNull();
    expect(r.report.horizons["1w"].stock).not.toBeNull();
  });

  test("a past member still gets a card, with when it left", async () => {
    await db.insert(schema.indexMembers).values({ indexName: "NIFTY50", symbol: "GONE", addedOn: "2020-01-01", removedOn: d(5) });
    await seed("GONE", 30, () => -1);
    await seedIndex(30);
    const r = await stockReport("GONE");
    if (r.kind !== "ok") throw new Error(r.kind);
    expect(r.report.membership).toEqual([{ addedOn: "2020-01-01", removedOn: d(5) }]);
  });

  test("events include corporate actions filed under an earlier symbol, and renames", async () => {
    await db.insert(schema.indexMembers).values({ indexName: "NIFTY50", symbol: "NEWN", addedOn: "2020-01-01", removedOn: null });
    await db.insert(schema.symbolChanges).values({ oldSymbol: "OLDN", newSymbol: "NEWN", changedOn: d(20), company: null });
    await db.insert(schema.corporateActions).values([
      { symbol: "OLDN", exDate: d(10), series: "EQ", subject: "Bonus 1:1", kind: "bonus", factor: 2, company: null, recordDate: null },
      { symbol: "NEWN", exDate: d(25), series: "EQ", subject: "Dividend - Rs 2 Per Share", kind: "other", factor: 1, company: null, recordDate: null },
    ]);
    await seed("NEWN", 30, () => 0.5);
    await seedIndex(30);
    const r = await stockReport("NEWN");
    if (r.kind !== "ok") throw new Error(r.kind);
    expect(r.report.events.map((e) => e.kind)).toEqual(["rename", "bonus"]);
    expect(r.report.dividends12m).toBe(1);
  });

  test("no look-ahead: a past date ignores later sessions", async () => {
    await db.insert(schema.indexMembers).values({ indexName: "NIFTY50", symbol: "AAA", addedOn: "2020-01-01", removedOn: null });
    await seed("AAA", 100, (i) => (i < 80 ? 0.1 : -5)); // crash after session 80
    await seedIndex(100);
    const r = await stockReport("AAA", d(79));
    if (r.kind !== "ok") throw new Error(r.kind);
    expect(r.report.date).toBe(d(79));
    expect(r.report.worstFall.stock!.depthPct).toBeCloseTo(0, 9);
  });
});

test("supportedStocks lists current members first", async () => {
  await reset();
  await db.insert(schema.indexMembers).values([
    { indexName: "NIFTY50", symbol: "ZED", addedOn: "2020-01-01", removedOn: null },
    { indexName: "NIFTY50", symbol: "OLD", addedOn: "2020-01-01", removedOn: "2021-01-01" },
  ]);
  expect(await supportedStocks()).toEqual([{ symbol: "ZED", current: true }, { symbol: "OLD", current: false }]);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `bun test tests/stock-report.test.ts` → FAIL, module not found.

- [ ] **Step 3: Implement** (`src/query/stock-report.ts`)

```ts
/**
 * The Stock Report Card's data: one NIFTY 50 member (current or past), read
 * on or before a session. Everything comes from the adjusted daily moves, so
 * splits, demergers and renames can't fake a fall. Spec:
 * docs/superpowers/specs/2026-10-02-stock-report-card-design.md.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { symbolLineage } from "../ingest/symbol-changes";
import {
  HORIZONS, THRESHOLDS, adjustedLine, closesToMoves, currentDrawdownPct, dailyVolatility,
  drawdownSeries, horizonStats, liquidityLight, percentRank, periodReturn, ratioLight,
  strengthLight, trendLight, worstDrawdown,
  type Drawdown, type HorizonKey, type HorizonStats, type Light,
} from "../indicators/risk";

const INDEX = "Nifty 50"; // NSE's name in index_prices
const SHARE_COUNT_KINDS = ["split", "bonus", "bonus+split", "consolidation", "demerger"];

// (types HorizonPair, StockReport, StockReportResult exactly as in the Interfaces block)

export async function supportedStocks(indexName = "NIFTY50") {
  const rows = await db.execute<{ symbol: string; current: boolean }>(sql`
    select symbol, bool_or(removed_on is null) as current
    from index_members where index_name = ${indexName}
    group by symbol
    order by bool_or(removed_on is null) desc, symbol`);
  return rows.map((r) => ({ symbol: r.symbol, current: Boolean(r.current) }));
}

export async function stockReport(symbol: string, dateIso?: string, indexName = "NIFTY50"): Promise<StockReportResult> {
  const membership = (await db.execute<{ added_on: string; removed_on: string | null }>(sql`
    select added_on::text, removed_on::text from index_members
    where index_name = ${indexName} and symbol = ${symbol} order by added_on`))
    .map((m) => ({ addedOn: m.added_on, removedOn: m.removed_on }));
  if (membership.length === 0) return { kind: "unknown" };

  const all = await db.execute<{ d: string; close: number; sma_50: number | null; sma_200: number | null; change_pct: number | null; turnover: number | null }>(sql`
    select trade_date::text d, close, sma_50, sma_200, change_pct, turnover
    from daily_indicators where symbol = ${symbol} order by trade_date`);
  const firstDate = all[0]?.d ?? null;
  const upto = dateIso ? all.filter((r) => r.d <= dateIso) : all;
  if (upto.length === 0) return { kind: "no-data", symbol, firstDate };

  const cur = upto.at(-1)!;
  const date = cur.d;
  const idx = all.findIndex((r) => r.d === date);
  const prev = idx > 0 ? all[idx - 1]!.d : null;
  const next = idx < all.length - 1 ? all[idx + 1]!.d : null;

  const num = (v: number | null) => (v === null ? null : Number(v));
  const moves = upto.map((r) => ({ date: r.d, changePct: num(r.change_pct) }));
  const line = adjustedLine(moves);

  // NIFTY 50 over exactly the same span
  const niftyRows = (await db.execute<{ d: string; close: number }>(sql`
    select trade_date::text d, close from index_prices
    where index_name = ${INDEX} and trade_date between ${upto[0]!.d} and ${date} order by trade_date`))
    .map((r) => ({ date: r.d, close: Number(r.close) }));
  const niftyMoves = closesToMoves(niftyRows);
  const niftyLine = adjustedLine(niftyMoves);

  // Trend
  const sma50 = num(cur.sma_50), sma200 = num(cur.sma_200), close = Number(cur.close);
  let sessions200 = 0;
  const side200 = sma200 === null ? null : close > sma200 ? "above" : "below";
  for (let i = upto.length - 1; i >= 0 && side200; i--) {
    const s = num(upto[i]!.sma_200);
    if (s === null || (Number(upto[i]!.close) > s ? "above" : "below") !== side200) break;
    sessions200++;
  }

  // Strength: 6-month return vs NIFTY, ranked among members on the date
  const ret6m = periodReturn(line, 126);
  const nifty6m = periodReturn(niftyLine, 126);
  const peers = await db.execute<{ symbol: string; d: string; change_pct: number | null }>(sql`
    select i.symbol, i.trade_date::text d, i.change_pct
    from daily_indicators i
    where i.trade_date <= ${date}
      and i.trade_date > ${date}::date - 220
      and i.symbol in (select m.symbol from index_members m where m.index_name = ${indexName}
                        and ${date} >= m.added_on and (m.removed_on is null or ${date} < m.removed_on))
    order by i.symbol, i.trade_date`);
  const bySym = new Map<string, { date: string; changePct: number | null }[]>();
  for (const p of peers) {
    const list = bySym.get(p.symbol) ?? [];
    list.push({ date: p.d, changePct: num(p.change_pct) });
    bySym.set(p.symbol, list);
  }
  const peerReturns = [...bySym.values()]
    .map((pts) => periodReturn(adjustedLine(pts), 126))
    .filter((v): v is number => v !== null);
  const percentile = ret6m === null || peerReturns.length === 0 ? null : percentRank(ret6m, peerReturns);

  // Bumpiness: last 250 sessions, stock vs NIFTY over the same span
  const dailyVol = dailyVolatility(moves.map((m) => m.changePct));
  const niftyVol = dailyVolatility(niftyMoves.map((m) => m.changePct));
  const volRatio = dailyVol !== null && niftyVol ? dailyVol / niftyVol : null;

  // Worst fall
  const ddStock = worstDrawdown(line);
  const ddNifty = worstDrawdown(niftyLine);
  const ddRatio = ddStock && ddNifty && ddNifty.depthPct < 0 ? ddStock.depthPct / ddNifty.depthPct : null;

  // Liquidity: median ₹ turnover, last 20 sessions, in crore
  const recent = upto.slice(-THRESHOLDS.liquiditySessions).map((r) => num(r.turnover)).filter((v): v is number => v !== null).sort((a, b) => a - b);
  const medianCrore = recent.length ? recent[Math.floor((recent.length - 1) / 2)]! / 1e7 : null;

  // Horizons
  const horizons = Object.fromEntries(
    (Object.keys(HORIZONS) as HorizonKey[]).map((k) => [k, { stock: horizonStats(line, HORIZONS[k]), nifty: horizonStats(niftyLine, HORIZONS[k]) }]),
  ) as Record<HorizonKey, { stock: HorizonStats | null; nifty: HorizonStats | null }>;

  // Price in the shown session's rupees: adjusted level scaled so the last point equals today's close
  const last = line.at(-1)!.level;
  const price = upto.map((r, i) => {
    const adj = (close * line[i]!.level) / last;
    const s200 = num(r.sma_200);
    return { date: r.d, close: adj, sma200: s200 === null ? null : (s200 * adj) / Number(r.close) };
  });

  // Events across the lineage
  const renames = (await db.execute<{ old_symbol: string; new_symbol: string; changed_on: string }>(sql`
    select old_symbol, new_symbol, changed_on::text from symbol_changes`))
    .map((r) => ({ oldSymbol: r.old_symbol, newSymbol: r.new_symbol, changedOn: r.changed_on }));
  const lineage = symbolLineage(symbol, renames);
  const syms = lineage.map((l) => l.symbol);
  const actions = await db.execute<{ d: string; kind: string; subject: string }>(sql`
    select ex_date::text d, kind, subject from corporate_actions
    where symbol in ${syms} and ex_date <= ${date} order by ex_date desc`);
  const events = [
    ...actions.filter((a) => SHARE_COUNT_KINDS.includes(a.kind)).map((a) => ({ date: a.d, kind: a.kind, text: a.subject })),
    ...lineage.slice(0, -1).map((l, i) => ({ date: l.from!, kind: "rename", text: `Renamed from ${lineage[i + 1]!.symbol} to ${l.symbol}` }))
      .filter((e) => e.date && e.date <= date),
  ].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
  const yearAgo = new Date(`${date}T00:00:00Z`); yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
  const dividends12m = actions.filter((a) => /dividend/i.test(a.subject) && a.d > yearAgo.toISOString().slice(0, 10)).length;

  return {
    kind: "ok",
    report: {
      symbol, date, requested: dateIso ?? null, snapped: Boolean(dateIso && dateIso !== date), prev, next,
      firstDate: firstDate!, membership, close,
      trend: { light: trendLight(close, sma50, sma200), sma50, sma200, side200, sessions200 },
      strength: {
        light: percentile === null ? null : strengthLight(percentile), percentile,
        ret3m: periodReturn(line, 63), ret6m, ret12m: periodReturn(line, 250), nifty6m,
      },
      bumpiness: { light: volRatio === null ? null : ratioLight(volRatio), dailyVol, niftyVol, ratio: volRatio },
      worstFall: { light: ddRatio === null ? null : ratioLight(ddRatio), stock: ddStock, nifty: ddNifty, ratio: ddRatio, currentPct: currentDrawdownPct(line) },
      liquidity: { light: medianCrore === null ? null : liquidityLight(medianCrore), medianCrore },
      horizons, price, drawdown: drawdownSeries(line), events, dividends12m,
    },
  };
}
```

Notes for the implementer:
- `sql\`... in ${syms}\`` with an array: Drizzle expands arrays in `sql` templates into a parameter list. If it renders as a single array parameter instead, use `sql.join(syms.map((s) => sql\`${s}\`), sql\`, \`)` inside `in (...)`.
- The lineage's `slice(0, -1)` pairs each symbol with the one before it (`lineage` is newest first); the rename date is that entry's `from`.
- The peers window `- 220` calendar days comfortably covers 126 sessions plus the weekends and holidays.

- [ ] **Step 4: Run tests**

Run: `bun test tests/stock-report.test.ts` → all PASS. Then `bunx tsc --noEmit`.

- [ ] **Step 5: Sanity-check real data**

```bash
bun -e 'import { stockReport } from "./src/query/stock-report"; for (const s of ["KOTAKBANK","ETERNAL","YESBANK"]) { const r = await stockReport(s); if (r.kind==="ok") console.log(s, r.report.date, r.report.trend.light, r.report.strength.percentile?.toFixed(0), r.report.bumpiness.ratio?.toFixed(2), r.report.worstFall.stock?.depthPct.toFixed(1), r.report.worstFall.stock?.peakDate, r.report.liquidity.medianCrore?.toFixed(0), r.report.events.length); } process.exit(0)'
```

Expected: KOTAKBANK's worst fall is **not** the −80% split (decision 0002); ETERNAL's history starts July 2021 and its events include "Renamed from ZOMATO to ETERNAL"; YESBANK's worst fall is around −90%+ (its 2018–2020 collapse).

- [ ] **Step 6: Commit**

```bash
git add src/query/stock-report.ts tests/stock-report.test.ts
git commit -m "Assemble the Stock Report from adjusted moves, index closes and events"
```

---

### Task 5: The Report Card page — header, lights and checks

**Files:**
- Create: `src/app/stock/[symbol]/page.tsx`
- Create: `src/components/StockChecks.tsx`
- Create: `src/components/LightDot.tsx`

**Interfaces:**
- Consumes: `stockReport`, `StockReport`, `StockReportResult` (Task 4); `AppShell`, `PageHeader`, `DateNav` (existing; `DateNav` props `base`, `extra`, `ma`, `date`, `requested`, `snapped`, `prev`, `next`, `min`, `max`); `formatDate`, `signed`, `formatInt` from `src/lib/format.ts`.
- Produces: route `/stock/[symbol]?date=&h=`; `LightDot({ light })`; `StockChecks({ report })`.

Read first: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` (params and searchParams are Promises) and `.../dynamic-routes.md` for `[symbol]`. Use `notFound()` from `next/navigation`.

- [ ] **Step 1: Write `LightDot`**

```tsx
import { cn } from "@/lib/utils";
import type { Light } from "@/indicators/risk";

const COPY: Record<Light, string> = { green: "Green", amber: "Amber", red: "Red" };

/** A traffic light that never relies on colour alone: it carries its word. */
export default function LightDot({ light, className }: { light: Light | null; className?: string }) {
  if (!light) return <span className={cn("text-[12px] text-muted-foreground", className)}>Not enough history</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-medium", className)}>
      <span
        aria-hidden="true"
        className={cn("size-2.5 rounded-full", light === "green" ? "bg-up" : light === "red" ? "bg-down" : "bg-[var(--chart-muted)] ring-2 ring-inset ring-foreground/40")}
      />
      <span className={light === "green" ? "text-up" : light === "red" ? "text-down" : "text-foreground-2"}>{COPY[light]}</span>
    </span>
  );
}
```

(The design system has no amber hue; amber is a neutral ring plus the word "Amber". Record this in decision 0011.)

- [ ] **Step 2: Write `StockChecks`** — five cards in a responsive grid (`grid gap-4 md:grid-cols-2 xl:grid-cols-5`), each: label, `LightDot`, a `text-metric` figure, one sentence. Sentences (exact):
  - Trend: `"Above its 50- and 200-day averages; above the 200-day for {n} sessions."` / `"Above its 200-day average but below its 50-day."` / `"Above its 50-day average but below its 200-day."` / `"Below both its 50- and 200-day averages, for {n} sessions under the 200-day."` Figure: `signed(close/sma200−1 %, 1) + "%"` vs the 200-day.
  - Strength: `"6-month return {signed(ret6m,1)}% vs the NIFTY 50's {signed(nifty6m,1)}%: stronger than {percentile}% of today's members."` Figure: `{percentile}th`.
  - Bumpiness: `"A typical day moves about ±{dailyVol.toFixed(1)}%, {ratio.toFixed(1)}× the NIFTY 50's ±{niftyVol.toFixed(1)}%."` Figure: `{ratio.toFixed(1)}×`.
  - Worst fall: recovered → `"Fell {abs}% from {peak} to {trough}; took {months} months to get back. The NIFTY 50's worst over the same years was {abs}%."`; not recovered → `"Fell {abs}% from its {peak} high and hasn't recovered: still {abs(current)}% below it."` Figure: `{depth.toFixed(0)}%` with true minus. Months = round(sessionsToRecover / 21).
  - Liquidity: `"About ₹{formatInt(round(crore))} crore changes hands on a typical day: easy to buy and sell."` (amber: "Thinner trading: large orders can move the price."; red: "Thin trading: getting in and out can be costly.") Figure: `₹{formatInt(round(crore))} cr`.

Every sentence comes from report numbers; nothing is hard-coded per stock.

- [ ] **Step 3: Write the page**

```tsx
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import DateNav from "@/components/DateNav";
import StockChecks from "@/components/StockChecks";
import LightDot from "@/components/LightDot";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { stockReport } from "@/query/stock-report";
import { HORIZONS, type HorizonKey } from "@/indicators/risk";

export const dynamic = "force-dynamic";

function cleanDate(v: string | undefined) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}
function isHorizon(v: string | undefined): v is HorizonKey {
  return v === "1w" || v === "1m" || v === "3m" || v === "1y";
}

export default async function Page({
  params, searchParams,
}: { params: Promise<{ symbol: string }>; searchParams: Promise<{ date?: string; h?: string }> }) {
  const { symbol: raw } = await params;
  const sp = await searchParams;
  const symbol = decodeURIComponent(raw).toUpperCase();
  // Symbols are A–Z, 0–9, & and -: anything else can't be a stock, and never reaches the query.
  if (!/^[A-Z0-9&-]{1,20}$/.test(symbol)) notFound();
  const h: HorizonKey = isHorizon(sp.h) ? sp.h : "1m";
  const wanted = cleanDate(sp.date);

  const res = await stockReport(symbol, wanted);
  if (res.kind === "unknown") notFound();
  // render: PageHeader (eyebrow "NIFTY 50 · Stock", title symbol, description = membership line),
  // DateNav base={`/stock/${encodeURIComponent(symbol)}`} extra={`&h=${h}`} ma="sma200",
  // summary strip of five LightDots with counts "3 green · 1 amber · 1 red",
  // <StockChecks report={...} />; "no-data" → the standard "Nothing loaded" card naming firstDate.
}
```

Membership line: current → `In the NIFTY 50 since {formatDate(addedOn)}` (the last period); past → `Was in the NIFTY 50 {from} – {to}`; history start 2020-01-01 shown as "since Jan 2020 (start of the membership record)". Add `"stock"` to the `Section` union in `src/components/SiteNav.tsx` and `stock: "/stock"` to `BASE` in `src/components/Hotkeys.tsx` in this task, and pass `current="stock"` to `AppShell` and `page="stock"` to `Hotkeys`. The sidebar *link* and the `r` key come in Task 7.

- [ ] **Step 4: Check it renders** (no unit test for markup; the queries are tested)

```bash
bunx tsc --noEmit
bun run dev -- -p 3001 &
for u in /stock/RELIANCE /stock/M%26M /stock/BAJAJ-AUTO /stock/YESBANK /stock/ETERNAL "/stock/RELIANCE?date=2020-03-23" /stock/nope "/stock/..%2Fx"; do printf "%-36s %s\n" "$u" "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3001$u")"; done
```

Expected: 200 for the real stocks (M&M URL-decodes), 404 for `nope` and the path-traversal attempt.

- [ ] **Step 5: Commit**

```bash
git add src/app/stock src/components/StockChecks.tsx src/components/LightDot.tsx src/components/SiteNav.tsx src/components/Hotkeys.tsx
git commit -m "Add the Stock Report Card page: header, lights and five checks"
```

---

### Task 6: Risk calculator, price and drawdown charts, events

**Files:**
- Create: `src/components/RiskCalculator.tsx` (client)
- Create: `src/components/StockPriceChart.tsx` (client)
- Create: `src/components/DrawdownChart.tsx` (client)
- Create: `src/components/StockEvents.tsx`
- Modify: `src/app/stock/[symbol]/page.tsx` (render them)
- Test: `tests/format.test.ts` (rupee helper)

**Interfaces:**
- Consumes: `StockReport.horizons`, `.price`, `.drawdown`, `.events`, `.dividends12m` (Task 4); `HorizonKey`, `HORIZONS` (Task 3); `dateTicks` (`src/lib/ticks.ts`); chart wrapper `ChartContainer` etc. (`src/components/ui/chart.tsx`).
- Produces: `formatRupees(n: number): string` in `src/lib/format.ts` — `"−₹1,820"`, `"₹10,000"`; `RiskCalculator({ horizons, initial })`.

- [ ] **Step 1: Failing test for `formatRupees`** (append to `tests/format.test.ts`)

```ts
import { formatRupees } from "../src/lib/format";
test("formatRupees: true minus, Indian grouping, no decimals", () => {
  expect(formatRupees(-1820.4)).toBe("−₹1,820");
  expect(formatRupees(123456)).toBe("₹1,23,456");
  expect(formatRupees(0)).toBe("₹0");
});
```

Run: `bun test tests/format.test.ts` → FAIL.

- [ ] **Step 2: Implement `formatRupees`** (in `src/lib/format.ts`)

```ts
/** Rupees, whole, Indian grouping, true minus: −₹1,820. */
export function formatRupees(n: number): string {
  const s = Math.round(Math.abs(n)).toLocaleString("en-IN");
  return Math.round(n) < 0 ? `−₹${s}` : `₹${s}`;
}
```

Run the test → PASS.

- [ ] **Step 3: `RiskCalculator`** (client). State: `amount` (number, default 10,000, input `type="number"` min 1,000 step 1,000, clamped to 1,000–10,00,00,000), `h` (initial from props; changing it calls `window.history.replaceState` to set `?h=` without a reload). For the chosen horizon with `stock` stats:
  - Three lines, in this order:
    `1 in 10 {label}s lost more than {formatRupees(amount*p10/100)}` (only if p10 < 0; otherwise `"Even the weakest 1 in 10 {label}s ended higher"`),
    `The worst {label} since {formatDate(firstDate)}: {formatRupees(amount*worst/100)} (starting {formatDate(worstStart)})`,
    `{label}s that ended lower: {shareNegative.toFixed(0)}%`.
  - Comparison: `The NIFTY 50's 1-in-10 {label}: {formatRupees(amount*nifty.p10/100)}`.
  - Histogram: the 20 `bins` as `div` bars (same pattern as `BreadthHero`'s distribution), each tooltip `"{formatRupees(from)} to {formatRupees(to)}: {count} {label}s"`, the bin containing the NIFTY's p10 outlined with `ring-1 ring-foreground/40` and a legend line "Outlined: the NIFTY 50's 1-in-10".
  - Null stats → `"Not enough history yet for {label}-long stretches."`
  - Caveat footer (exact): `Past ranges, not a forecast. Losses can be larger than anything in this history.`
  - Labels: `1w` → "week", `1m` → "month", `3m` → "3-month stretch", `1y` → "year".

- [ ] **Step 4: `StockPriceChart`** (client): Recharts `LineChart`, two series (adjusted close `var(--chart-1)` 2px; 200-day `var(--muted-foreground)` 1.5px dashed), legend with both (two series → legend required), `dateTicks` x-axis, `formatPrice` y-ticks, tooltip "date · close · 200-day", `isAnimationActive={false}`, footer "Adjusted for splits, bonuses and demergers, in today's rupees."

- [ ] **Step 5: `DrawdownChart`** (client): `AreaChart` of `drawdown.pct` (≤ 0), stroke and wash `var(--down)` (it is a below-the-line measure), y ticks `0%, −25%, −50%…`, a `ReferenceDot` at the worst trough labelled `"Worst: −{x}%, {formatDate(trough)}"`, tooltip "date: −x% below its high". Title "How far below its high".

- [ ] **Step 6: `StockEvents`** (server): list `date · kind · text`; kind labels split/bonus/bonus+split/consolidation/demerger/rename → "Split", "Bonus", "Split and bonus", "Consolidation", "Demerger", "Renamed"; footer `"{n} dividends in the 12 months to {date}."`; empty → "No splits, bonuses, demergers or renames on record."

- [ ] **Step 7: Render in the page** under the checks: `RiskCalculator` (full width, `h`), then `StockPriceChart` (full width), then a 12-column row: `DrawdownChart` (8) and `StockEvents` (4). Pass only the fields each needs (keep the client payload small: `horizons` bins, not raw returns).

- [ ] **Step 8: Verify**

```bash
bunx tsc --noEmit && bun test
```

Then the headless-Chrome check (scratchpad `cdp.ts`, as used for the date picker): open `/stock/KOTAKBANK`, confirm no −80% cliff in the price or drawdown chart around 14 Jan 2026; type 50000 into the amount and switch to 1y, confirm the figures change and the URL gains `h=1y` without a reload.

- [ ] **Step 9: Commit**

```bash
git add src/components/RiskCalculator.tsx src/components/StockPriceChart.tsx src/components/DrawdownChart.tsx src/components/StockEvents.tsx src/app/stock src/lib/format.ts tests/format.test.ts
git commit -m "Add the risk calculator, price and drawdown charts, and events to the Report Card"
```

---

### Task 7: Entry points — `/stock` list, sidebar, shortcut, symbol links

**Files:**
- Create: `src/app/stock/page.tsx`, `src/components/StockList.tsx` (client filter)
- Modify: `src/components/SiteNav.tsx` (Stocks group: "Report card", `/stock`, key `r`, icon `IdCard` from lucide; shortcuts line `b a c s r`)
- Modify: `src/components/Hotkeys.tsx` (`r` → `/stock`)
- Modify: `src/components/MemberTable.tsx`, `src/components/ScreenerTable.tsx`, `src/app/screener/page.tsx` (NearCard), `src/components/CrossingsTable.tsx`: wrap the symbol text in `<Link href={`/stock/${encodeURIComponent(symbol)}`} className="hover:underline">`.

**Interfaces:**
- Consumes: `supportedStocks()` (Task 4).

- [ ] **Step 1:** `/stock` page: PageHeader (eyebrow "NIFTY 50 · Stocks", title "Report card", description "Pick a stock to see how risky it has been: trend, strength, bumpiness, worst fall, liquidity, and what a bad stretch would have cost."), then `StockList` with two groups, "In the NIFTY 50" and "Former members since 2020", and a filter box (as in `ScreenerTable`).
- [ ] **Step 2:** Sidebar, hotkey and links as listed above.
- [ ] **Step 3: Verify** `bunx tsc --noEmit && bun test`; curl `/stock` (200); headless check that clicking a symbol in the Breadth "Below" table opens its card.
- [ ] **Step 4: Commit**

```bash
git add src/app/stock/page.tsx src/components/StockList.tsx src/components/SiteNav.tsx src/components/Hotkeys.tsx src/components/MemberTable.tsx src/components/ScreenerTable.tsx src/app/screener/page.tsx src/components/CrossingsTable.tsx
git commit -m "Link every symbol to its Report Card; add the /stock list and sidebar entry"
```

---

### Task 8: Verify against TradingView, document, finish

**Files:**
- Create: `docs/decisions/0011-stock-report-card.md`
- Modify: `docs/decisions/README.md`, `README.md` (function reference for `risk.ts` and `stock-report.ts`), `docs/pipelines.md` (turnover column; dashboard pages), `CLAUDE.md` (pages list), `TODO.md` (roadmap note)

- [ ] **Step 1: TradingView check** (memory: verify before claiming). With the TradingView MCP, fetch `NSE:KOTAKBANK` weekly bars (`interval: "1W"`, `count: 520`) and compute the max peak-to-trough fall of the weekly closes; compare with the card's worst fall (expect within a few points: weekly vs daily). Do the same for `NSE:YESBANK`. Record the comparison in 0011.
- [ ] **Step 2: Write 0011** in the decision-log format (Problem, Options, Decision, Why, Checks, Revisit when): approach A and why; the thresholds and that lights are relative to the NIFTY 50; amber rendered as a neutral ring plus the word (no amber token); overlapping windows and the ≥ 3×h rule; "since Sep 2016"; no score (SEBI); the TradingView comparison; anything else met while building.
- [ ] **Step 3: Docs** as listed; add a row to `docs/decisions/README.md`.
- [ ] **Step 4: Full check**

```bash
bunx tsc --noEmit && bun test
git checkout -- next-env.d.ts   # dev server rewrites it
```

Expected: all tests pass, clean tree apart from the docs.

- [ ] **Step 5: Commit**

```bash
git add docs CLAUDE.md README.md TODO.md
git commit -m "Document the Stock Report Card (decision 0011)"
```
