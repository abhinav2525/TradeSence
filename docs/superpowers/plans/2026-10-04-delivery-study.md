# Research 0003 (delivery %) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A re-runnable study (`bun run research:delivery`) that judges 8 delivery-% signals across the liquid NSE market with a date-matched luck check and a 2023+ hold-out, written up as research 0003.

**Architecture:** The shared loader (`loadAdjustedHistory`) gains delivery arrays so renames are followed once. Pure, tested functions in `src/research/delivery.ts` turn one company's history into per-day series, flags and occasions, and judge them. A two-pass CLI loads every company (pass 1 builds the per-day comparison pools, pass 2 finds signals) and prints Markdown. Nothing is stored.

**Tech Stack:** Bun, TypeScript, drizzle `sql` over Postgres, `bun:test`.

**Spec:** `docs/superpowers/specs/2026-10-04-delivery-study-design.md`

## Global Constraints

- Run every test from the repo root: `bun test …` (hooks block it elsewhere; DB is `tradesence_test`).
- Delivery % = delivered ÷ traded × 100, both from `daily_delivery`.
- Excluded days (no delivery figure): `2019-06-17`, `2019-06-18`, `2023-09-04`, `2025-10-21`, `2026-09-11`.
- Liquid: median of the last 20 sessions' turnover ≥ ₹1 crore (`1e7`).
- `usual`/`spike` windows: previous 20 sessions, same segment, ≥ 15 values present; `level`: day + previous 19, ≥ 15.
- Spike threshold `HEAVY = 2` (import from `src/research/volume.ts`).
- Return = adjusted close D+1 → h sessions later, h ∈ `STUDY_HORIZONS` = [5, 10, 21, 63, 126]; main = 21; never across a gap.
- Discovery: episode start ≤ `2022-12-31`; hold-out: ≥ `2023-01-01`. Fifth cut points from discovery only.
- Build: discovery n ≥ 30, strength ≥ 97.5, same way ≥ 3 of 4, |median − baseline| ≥ 0.5 pp at 21; hold-out n ≥ 30 and beat ≥ 95 (better) / ≤ 5 (worse) matching discovery. Maybe: discovery same way ≥ 3, not Build.
- Episodes: `episodeStarts` (MERGE_GAP 10), per stock.
- Luck: 1,000 seeded draws, each episode replaced by a random *other* eligible stock on the same date; ties within `NOISE_PCT` count half.
- Never compare two computed returns for exact equality; use `NOISE_PCT` (CLAUDE.md).
- Per-company history only through `loadAdjustedHistory` (CLAUDE.md).

## Review Focus

- A company with no delivery rows at all (e.g. only BE days, or listed before 2016 and delisted): series all-null, never eligible, no crash.
- A day where `traded = 0` or a delivery row is missing in the middle of a window: treated as "no figure", window still valid if ≥ 15 present.
- A date where the stock is the only eligible stock: the luck draw has no "other" stock and must skip that occasion rather than loop forever or pick itself.
- A split inside the 20-session window: `spike` must not jump (delivered shares are share-adjusted).
- A segment boundary between D and D+1: no return (entry day must be in the same segment).

---

## File Structure

- Modify `src/indicators/history.ts`: `History` gains `traded` and `delivered`; the price query left-joins `daily_delivery`.
- Modify `tests/history.test.ts`: delivery joined across a rename.
- Modify `tests/volume-research.test.ts`: its two hand-built `History` literals get the new fields.
- Create `src/research/delivery.ts`: constants, per-stock series, flags, matched luck check, verdict.
- Create `tests/delivery-research.test.ts`: unit tests for the above.
- Create `src/research/delivery-data.ts`: `companies()` and `tradingDays()` queries.
- Create `src/research/cli-delivery.ts`: the two-pass runner, prints Markdown.
- Modify `package.json`: `research:delivery`.
- Create `docs/research/0003-does-delivery-predict.md`, `docs/decisions/0022-matched-luck-check.md`; modify `docs/decisions/README.md`, `TODO.md`, `README.md`, `CLAUDE.md`.

---

### Task 1: Delivery in the shared loader

**Files:**
- Modify: `src/indicators/history.ts` (type at lines 13–23, query at ~42–50, return at ~78–90)
- Modify: `tests/history.test.ts`, `tests/volume-research.test.ts:61,65`

**Interfaces:**
- Produces: `History.traded: (number | null)[]`, `History.delivered: (number | null)[]` (raw shares from `daily_delivery`, null when no row).

- [ ] **Step 1: Write the failing test** (append inside the `describe` in `tests/history.test.ts`; also add `schema.dailyDelivery` to the `beforeEach` table list)

```ts
  test("carries delivery figures across a rename, null where a day has none", async () => {
    await db.insert(schema.dailyPrices).values([
      bar("2026-01-01", "OLDCO", 200, 100),
      bar("2026-01-02", "NEWCO", 200, 100),
      bar("2026-01-05", "NEWCO", 100, 200),
    ]);
    await db.insert(schema.symbolChanges).values({ oldSymbol: "OLDCO", newSymbol: "NEWCO", changedOn: "2026-01-02" });
    await db.insert(schema.dailyDelivery).values([
      { tradeDate: "2026-01-01", symbol: "OLDCO", series: "EQ", tradedQty: 100, deliverableQty: 40 },
      { tradeDate: "2026-01-05", symbol: "NEWCO", series: "EQ", tradedQty: 200, deliverableQty: 150 },
    ]);
    const h = await loadAdjustedHistory("NEWCO", await loadRenames());
    expect(h!.traded).toEqual([100, null, 200]);
    expect(h!.delivered).toEqual([40, null, 150]);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test tests/history.test.ts`
Expected: FAIL (`traded` undefined).

- [ ] **Step 3: Implement.** In the `History` type add after `turnover`:

```ts
  traded: (number | null)[]; // shares traded per NSE's delivery file; null: no delivery row
  delivered: (number | null)[]; // shares delivered (raw; multiply by shareFactors like volume)
```

Replace the price query with a subquery + left join (the lineage clauses say `symbol = …`, which would be ambiguous inside a join):

```ts
  const prices = await db.execute<{
    trade_date: string; open: number; high: number; low: number; close: number; volume: number; turnover: number;
    traded_qty: number | null; deliverable_qty: number | null;
  }>(
    sql`select p.trade_date, p.open, p.high, p.low, p.close, p.volume, p.turnover, d.traded_qty, d.deliverable_qty
        from (select trade_date, symbol, series, open, high, low, close, volume, turnover
              from daily_prices
              where series = 'EQ' and (${sql.join(lineage.map((e) => inWindow(sql`trade_date`, e)), sql` or `)})) p
        left join daily_delivery d on d.trade_date = p.trade_date and d.symbol = p.symbol and d.series = p.series
        order by p.trade_date asc`,
  );
```

In the returned object add after `turnover`:

```ts
    traded: prices.map((p) => (p.traded_qty === null ? null : Number(p.traded_qty))),
    delivered: prices.map((p) => (p.deliverable_qty === null ? null : Number(p.deliverable_qty))),
```

In `tests/volume-research.test.ts` lines 61 and 65, add to each literal: `traded: [null, null, null, null], delivered: [null, null, null, null],`

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test tests/history.test.ts tests/compute.test.ts tests/volume-research.test.ts && bunx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/indicators/history.ts tests/history.test.ts tests/volume-research.test.ts
git commit -m "History loader carries delivery figures across renames (research 0003)"
```

---

### Task 2: Per-stock delivery series

**Files:**
- Create: `src/research/delivery.ts`
- Create: `tests/delivery-research.test.ts`

**Interfaces:**
- Consumes: `History` (Task 1); `segmentByGaps` (`src/indicators/gaps.ts`); `segmentIds`, `forwardReturnSafe`, `median` (`src/indicators/signals.ts`); `STUDY_HORIZONS` (`src/research/volume.ts`).
- Produces:
  - constants `WINDOW = 20`, `MIN_PRESENT = 15`, `MIN_TURNOVER = 1e7`, `EXCLUDED_DAYS: Set<string>`, `DISCOVERY_END = "2022-12-31"`, `MIN_EPISODES = 30`, `MIN_EFFECT = 0.5`, `HOLDOUT_BAR = 95`
  - `windowMean(v: (number | null)[], segs: number[][], offset: 0 | 1): (number | null)[]`
  - `type StockSeries = { dates: string[]; dp: (number|null)[]; rel: (number|null)[]; spike: (number|null)[]; level: (number|null)[]; move: (number|null)[]; eligible: boolean[]; returns: (number|null)[][] }` — `returns[h][i]`, h indexes `STUDY_HORIZONS`
  - `stockSeries(h: History): StockSeries`

- [ ] **Step 1: Write the failing tests** (`tests/delivery-research.test.ts`)

```ts
import { test, expect, describe } from "bun:test";
import type { History } from "../src/indicators/history";
import { windowMean, stockSeries, WINDOW } from "../src/research/delivery";

/** n consecutive weekdays from 2021-01-04, all fields filled, liquid. */
function hist(n: number, over: Partial<Record<keyof History, unknown[]>> = {}): History {
  const dates: string[] = [];
  const d = new Date("2021-01-04T00:00:00Z");
  while (dates.length < n) {
    if (d.getUTCDay() % 6 !== 0) dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const fill = <T,>(v: T) => dates.map(() => v);
  return {
    dates, open: fill(100), high: fill(101), low: fill(99), close: fill(100), volume: fill(1000),
    turnover: fill(2e7), factors: fill(1), shareFactors: fill(1), traded: fill(1000), delivered: fill(500),
    ...over,
  } as History;
}

describe("windowMean", () => {
  const segs = [[0, 1, 2, 3, 4]];
  test("offset 1 averages the sessions before i, offset 0 includes i", () => {
    const v = Array.from({ length: 30 }, (_, i) => i);
    const s = [v.map((_, i) => i)];
    expect(windowMean(v, s, 1)[25]).toBe((5 + 24) / 2); // sessions 5..24
    expect(windowMean(v, s, 0)[25]).toBe((6 + 25) / 2); // sessions 6..25
  });
  test("null with fewer than 15 values present", () => {
    expect(windowMean([1, 2, 3, 4, 5], segs, 1)[4]).toBeNull();
  });
  test("missing values are skipped, not counted as zero", () => {
    const v: (number | null)[] = Array.from({ length: 21 }, () => 10);
    v[3] = null;
    expect(windowMean(v, [v.map((_, i) => i)], 1)[20]).toBe(10);
  });
  test("never reaches across a segment boundary", () => {
    const v = Array.from({ length: 40 }, () => 1);
    const s = [Array.from({ length: 20 }, (_, i) => i), Array.from({ length: 20 }, (_, i) => i + 20)];
    expect(windowMean(v, s, 1)[25]).toBeNull(); // only 5 sessions into the second segment
  });
});

describe("stockSeries", () => {
  test("delivery % is delivered ÷ traded × 100", () => {
    expect(stockSeries(hist(30)).dp[0]).toBe(50);
  });

  test("rel is today's delivery % minus the previous 20 sessions' average", () => {
    const delivered = Array.from({ length: 30 }, () => 500);
    delivered[25] = 800;
    const s = stockSeries(hist(30, { delivered }));
    expect(s.rel[25]).toBeCloseTo(30, 9);
  });

  test("the five excluded days carry no figure", () => {
    const h = hist(30);
    h.dates[22] = "2019-06-17"; // only the label matters for this rule
    expect(stockSeries(h).dp[22]).toBeNull();
  });

  test("nothing traded is no figure, not 0% or a division by zero", () => {
    const traded = Array.from({ length: 30 }, () => 1000);
    traded[10] = 0;
    expect(stockSeries(hist(30, { traded })).dp[10]).toBeNull();
  });

  test("a 1:2 split inside the window doesn't fake a delivery spike", () => {
    // raw delivered doubles on the ex-date; shareFactors 2 before it, 1 after
    const delivered = Array.from({ length: 30 }, (_, i) => (i < 15 ? 500 : 1000));
    const traded = Array.from({ length: 30 }, (_, i) => (i < 15 ? 1000 : 2000));
    const shareFactors = Array.from({ length: 30 }, (_, i) => (i < 15 ? 2 : 1));
    const factors = shareFactors;
    const close = Array.from({ length: 30 }, (_, i) => (i < 15 ? 200 : 100));
    const s = stockSeries(hist(30, { delivered, traded, shareFactors, factors, close }));
    expect(s.spike[25]).toBeCloseTo(1, 9);
    expect(s.move[15]).toBeCloseTo(0, 9); // adjusted close flat across the split
  });

  test("returns start from the next session's close, never the signal day's", () => {
    const close = Array.from({ length: 40 }, (_, i) => 100 + i);
    const s = stockSeries(hist(40, { close }));
    // 5-session return for D = 20: close[21] → close[26]
    expect(s.returns[0]![20]).toBeCloseTo((126 / 121 - 1) * 100, 9);
  });

  test("no return when D+1 starts a new segment", () => {
    const h = hist(30);
    h.dates = h.dates.map((d, i) => (i >= 21 ? `2022-0${Math.floor(i / 10)}-1${i % 10}` : d));
    expect(stockSeries(h).returns[0]![20]).toBeNull();
  });

  test("eligible needs liquidity: a stock trading under ₹1 crore a day never counts", () => {
    const s = stockSeries(hist(30, { turnover: Array.from({ length: 30 }, () => 5e6) }));
    expect(s.eligible.some(Boolean)).toBe(false);
  });

  test("eligible from the first day with a usual level and 20 sessions of turnover", () => {
    const s = stockSeries(hist(30));
    expect(s.eligible.indexOf(true)).toBe(WINDOW - 1);
  });

  test("a company with no delivery rows is never eligible", () => {
    const none = Array.from({ length: 30 }, () => null);
    const s = stockSeries(hist(30, { traded: none, delivered: none }));
    expect(s.eligible.some(Boolean)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bun test tests/delivery-research.test.ts`
Expected: FAIL (cannot find module `../src/research/delivery`).

- [ ] **Step 3: Implement** `src/research/delivery.ts`

```ts
/**
 * Research 0003: does delivery % tell us anything? Pure, tested helpers; the
 * runner is cli-delivery.ts. Spec: docs/superpowers/specs/2026-10-04-delivery-study-design.md.
 */
import { segmentByGaps } from "../indicators/gaps";
import type { History } from "../indicators/history";
import { forwardReturnSafe, median, segmentIds } from "../indicators/signals";
import { STUDY_HORIZONS } from "./volume";

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
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/delivery-research.test.ts && bunx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/research/delivery.ts tests/delivery-research.test.ts
git commit -m "Research 0003: per-stock delivery series (rel, spike, level, D+1 returns)"
```

---

### Task 3: Signal flags and occasions

**Files:**
- Modify: `src/research/delivery.ts`
- Modify: `tests/delivery-research.test.ts`

**Interfaces:**
- Consumes: `StockSeries` (Task 2); `fifthOf`, `fifthCuts`, `HEAVY`, `episodeStarts` (`src/research/volume.ts`).
- Produces:
  - `SIGNALS: readonly string[]` (the 8 names, in spec order)
  - `signalFlags(s: StockSeries, relCuts: number[], levelCutsOf: (date: string) => number[] | undefined): boolean[][]` — 8 arrays, order = `SIGNALS`
  - `levelCutsByDate(byDate: Map<string, number[]>): Map<string, number[]>` (dates with < 5 values get no cuts)
  - `type Occasion = { date: string; day: number; pos: number; returns: (number | null)[] }`
  - `occasionsOf(flags: boolean[], s: StockSeries, dayOf: (date: string) => number, posOf: (i: number) => number): Occasion[]`

- [ ] **Step 1: Write the failing tests** (append to `tests/delivery-research.test.ts`; extend the import with `signalFlags, levelCutsByDate, occasionsOf, SIGNALS`)

```ts
describe("signalFlags", () => {
  // A hand-built series: 4 days, all eligible.
  const s = {
    dates: ["2021-01-04", "2021-01-05", "2021-01-06", "2021-01-07"],
    dp: [50, 50, 50, 50], rel: [30, -30, 30, 0], spike: [2.5, 1, 2, 3], level: [80, 20, 50, 50],
    move: [1, -1, -2, 0], eligible: [true, true, true, false], returns: [],
  };
  const relCuts = [-20, -5, 5, 20];
  const cuts = () => [30, 40, 60, 70];
  const f = signalFlags(s, relCuts, cuts);

  test("eight signals, in the spec's order", () => {
    expect(SIGNALS).toHaveLength(8);
    expect(f).toHaveLength(8);
  });
  test("high / low delivery against its own normal", () => {
    expect(f[0]).toEqual([true, false, true, false]);
    expect(f[1]).toEqual([false, true, false, false]);
  });
  test("accumulation needs a rise, distribution a fall", () => {
    expect(f[2]).toEqual([true, false, false, false]);
    expect(f[3]).toEqual([false, false, true, false]);
  });
  test("spike at exactly 2× counts; price direction splits it; ineligible days never fire", () => {
    expect(f[4]).toEqual([true, false, false, false]);
    expect(f[5]).toEqual([false, false, true, false]);
  });
  test("level fifths are cut across stocks on each day", () => {
    expect(f[6]).toEqual([true, false, false, false]);
    expect(f[7]).toEqual([false, true, false, false]);
  });
  test("a day with no level cuts fires neither level signal", () => {
    const g = signalFlags(s, relCuts, () => undefined);
    expect(g[6]!.some(Boolean) || g[7]!.some(Boolean)).toBe(false);
  });
});

describe("levelCutsByDate", () => {
  test("cuts each date's values into fifths; too few values gives no cuts", () => {
    const m = levelCutsByDate(new Map([["d1", [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]], ["d2", [1, 2]]]));
    expect(m.get("d1")).toHaveLength(4);
    expect(m.has("d2")).toBe(false);
  });
});

describe("occasionsOf", () => {
  test("one occasion per episode start, carrying its returns, day and pool position", () => {
    // Days 1 and 13 are 11 sessions apart (> MERGE_GAP 10): two episodes. Day 12 would merge.
    const flags = [true, true, false, false, false, false, false, false, false, false, false, false, false, true];
    const s = {
      dates: flags.map((_, i) => `2021-01-${String(i + 1).padStart(2, "0")}`),
      dp: [], rel: [], spike: [], level: [], move: [], eligible: [],
      returns: [flags.map((_, i) => i * 1.0)],
    };
    const occ = occasionsOf(flags, s, (d) => Number(d.slice(-2)), (i) => i + 100);
    expect(occ.map((o) => o.date)).toEqual(["2021-01-01", "2021-01-14"]);
    expect(occ[1]).toEqual({ date: "2021-01-14", day: 14, pos: 113, returns: [13] });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bun test tests/delivery-research.test.ts`
Expected: FAIL (`signalFlags` not exported).

- [ ] **Step 3: Implement** (append to `src/research/delivery.ts`; extend the `./volume` import to `{ STUDY_HORIZONS, HEAVY, episodeStarts, fifthCuts, fifthOf }`)

```ts
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
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/delivery-research.test.ts && bunx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/research/delivery.ts tests/delivery-research.test.ts
git commit -m "Research 0003: the eight delivery signals and their episodes"
```

---

### Task 4: Date-matched luck check and verdict

**Files:**
- Modify: `src/research/delivery.ts`
- Modify: `tests/delivery-research.test.ts`

**Interfaces:**
- Consumes: `Occasion` (Task 3); `mulberry32`, `sameWay`, `distinctMonths`, `DRAWS`, `LUCK_BAR`, `type Luck`, `type Verdict` (`src/research/volume.ts`); `median`; `NOISE_PCT` (`src/indicators/risk.ts`).
- Produces:
  - `matchedLuck(signal: Occasion[], pools: number[][], main: number, draws?: number, seed?: number): Luck | null` — `pools[day]` = that day's eligible main-span returns
  - `type Part = { n: number; months: number; medians: (number|null)[]; baseline: (number|null)[]; luck: Luck | null }`
  - `part(occ: Occasion[], pools: number[][][], dayMedians: (number|null)[][], main: number): Part` — `pools[h][day]`, `dayMedians[h][day]`
  - `type DeliveryResult = { name: string; discovery: Part; holdout: Part; same: number; effect: number | null; verdict: Verdict }`
  - `deliveryVerdict(name: string, discovery: Part, holdout: Part, main: number): DeliveryResult`

- [ ] **Step 1: Write the failing tests** (append; extend the import with `matchedLuck, part, deliveryVerdict, type Occasion` and add `import { mulberry32 } from "../src/research/volume";`)

```ts
const occ = (day: number, pos: number, ret: number): Occasion => ({ date: `2021-01-${String(day + 1).padStart(2, "0")}`, day, pos, returns: [ret] });

describe("matchedLuck", () => {
  test("a signal far above every other stock on its days is 'better' with strength 100", () => {
    const pools = [[0, 1, 2, 50], [0, 1, 2, 50]];
    const l = matchedLuck([occ(0, 3, 50), occ(1, 3, 50)], pools, 0, 200)!;
    expect(l.direction).toBe("better");
    expect(l.strength).toBe(100);
  });

  test("never draws the stock itself, and skips a day with no other stock", () => {
    // Day 0 holds only the signal stock; day 1 has one other stock at 0.
    const l = matchedLuck([occ(0, 0, 5), occ(1, 0, 5)], [[5], [5, 0]], 0, 50)!;
    expect(l.beat).toBe(100); // every draw is [0]: below 5
  });

  test("is reproducible for a seed", () => {
    const pools = [[1, 2, 3, 4, 5], [5, 4, 3, 2, 1]];
    const s = [occ(0, 2, 3), occ(1, 0, 5)];
    expect(matchedLuck(s, pools, 0, 300, 7)).toEqual(matchedLuck(s, pools, 0, 300, 7));
  });

  // Calibration: a "signal" that is just random stocks should pass the 97.5 bar ~5% of the time.
  test("random signals pass the two-sided 97.5 bar about 5% of the time", () => {
    const rand = mulberry32(42);
    const pools = Array.from({ length: 200 }, () => Array.from({ length: 30 }, () => rand() * 20 - 10));
    let passes = 0;
    const runs = 300;
    for (let r = 0; r < runs; r++) {
      const sig = Array.from({ length: 40 }, () => {
        const day = Math.floor(rand() * pools.length);
        const pos = Math.floor(rand() * 30);
        return occ(day, pos, pools[day]![pos]!);
      });
      if (matchedLuck(sig, pools, 0, 200, r + 1)!.strength >= 97.5) passes++;
    }
    expect(passes / runs).toBeGreaterThan(0.01);
    expect(passes / runs).toBeLessThan(0.1);
  });
});

describe("part and deliveryVerdict", () => {
  // Two horizons for brevity; main = 0.
  const mk = (n: number, med: number, base: number, beat: number, same = 1) => ({
    n, months: 12, medians: [med, med], baseline: [base, base],
    luck: { beat, direction: beat >= 50 ? "better" as const : "worse" as const, strength: Math.max(beat, 100 - beat) },
  });

  test("part: baseline is the median of the episode days' medians", () => {
    const pools = [[[1, 2, 3], [10, 20, 30]]];
    const dayMedians = [[2, 20]];
    const p = part([occ(0, 0, 1), occ(1, 0, 10)], pools, dayMedians, 0);
    expect(p.baseline[0]).toBe(11);
    expect(p.medians[0]).toBe(5.5);
    expect(p.n).toBe(2);
  });

  test("Build needs discovery and hold-out both", () => {
    const v = deliveryVerdict("x", mk(40, 2, 0, 99), mk(40, 1, 0, 96), 0);
    expect(v.verdict).toBe("Build");
  });

  test("a discovery pass that the hold-out doesn't confirm is only Maybe", () => {
    expect(deliveryVerdict("x", mk(40, 2, 0, 99), mk(40, 1, 0, 80), 0).verdict).toBe("Maybe");
    expect(deliveryVerdict("x", mk(40, 2, 0, 99), mk(20, 1, 0, 99), 0).verdict).toBe("Maybe");
  });

  test("an effect under 0.5 points can't Build, however unusual", () => {
    expect(deliveryVerdict("x", mk(40, 0.3, 0, 100), mk(40, 0.3, 0, 100), 0).verdict).toBe("Maybe");
  });

  test("a 'worse' signal is confirmed by a hold-out beat of 5 or less", () => {
    expect(deliveryVerdict("x", mk(40, -2, 0, 1), mk(40, -1, 0, 4), 0).verdict).toBe("Build");
    expect(deliveryVerdict("x", mk(40, -2, 0, 1), mk(40, -1, 0, 96), 0).verdict).toBe("Maybe");
  });
});
```

Note: with two horizons, `sameWay` counts "other horizons on the same side"; `mk` gives both horizons the same median, so `same = 1`. The verdict's "≥ 3 of 4" rule therefore needs the real 5-horizon arrays; to keep these tests on the verdict logic, `deliveryVerdict` takes the needed count from `STUDY_HORIZONS.length - 2` only when arrays are full length. Implement it as: `need = Math.min(3, discovery.medians.length - 1)`.

- [ ] **Step 2: Run to verify they fail**

Run: `bun test tests/delivery-research.test.ts`
Expected: FAIL (`matchedLuck` not exported).

- [ ] **Step 3: Implement** (append to `src/research/delivery.ts`; extend imports: `import { NOISE_PCT } from "../indicators/risk";` and from `./volume` also `DRAWS, LUCK_BAR, distinctMonths, mulberry32, sameWay, type Luck, type Verdict`)

```ts
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

export type Part = {
  n: number; // occasions with a main-span return
  months: number;
  medians: (number | null)[];
  baseline: (number | null)[]; // median, over the occasions' days, of each day's median
  luck: Luck | null;
};

export function part(occ: Occasion[], pools: number[][][], dayMedians: (number | null)[][], main: number): Part {
  const horizons = pools.length;
  const medians = Array.from({ length: horizons }, (_, h) =>
    median(occ.map((o) => o.returns[h]).filter((v): v is number => v != null)));
  const baseline = Array.from({ length: horizons }, (_, h) =>
    median(occ.filter((o) => o.returns[h] != null).map((o) => dayMedians[h]![o.day]).filter((v): v is number => v != null)));
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
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/delivery-research.test.ts && bunx tsc --noEmit`
Expected: all PASS (the calibration test may take a few seconds).

- [ ] **Step 5: Commit**

```bash
git add src/research/delivery.ts tests/delivery-research.test.ts
git commit -m "Research 0003: date-matched luck check and hold-out verdict (decision 0022)"
```

---

### Task 5: Data queries and the runner

**Files:**
- Create: `src/research/delivery-data.ts`
- Create: `src/research/cli-delivery.ts`
- Modify: `package.json` (scripts, after `research:volume`)
- Test: `tests/delivery-research.test.ts` (DB test for `companies`)

**Interfaces:**
- Consumes: everything above; `loadAdjustedHistory`, `loadRenames`; `memberWindows` (`src/research/volume-data.ts`); `memberFlags`, `fifthCuts`, `fifthOf`, `STUDY_HORIZONS` (`src/research/volume.ts`).
- Produces: `companies(): Promise<string[]>`, `tradingDays(from: string): Promise<string[]>`; `bun run research:delivery` printing Markdown.

- [ ] **Step 1: Write the failing DB test** (append; add imports `import { db, schema } from "../src/db";`, `import { beforeEach } from "bun:test";` (merge into the existing bun:test import) and `import { companies } from "../src/research/delivery-data";`)

```ts
describe("companies", () => {
  beforeEach(async () => {
    for (const t of [schema.dailyPrices, schema.symbolChanges]) await db.delete(t);
  });
  const bar = (tradeDate: string, symbol: string) => ({
    tradeDate, symbol, series: "EQ", open: 1, high: 1, low: 1, close: 1, prevClose: 1, volume: 1, turnover: 1,
  });

  test("each company once, under its latest symbol; delisted companies stay in", async () => {
    await db.insert(schema.dailyPrices).values([
      bar("2020-01-01", "OLDCO"), bar("2020-02-03", "NEWCO"), bar("2019-01-01", "GONE"),
    ]);
    await db.insert(schema.symbolChanges).values({ oldSymbol: "OLDCO", newSymbol: "NEWCO", changedOn: "2020-02-01" });
    expect((await companies()).sort()).toEqual(["GONE", "NEWCO"]);
  });

  test("a ticker reused after its rename is a company of its own", async () => {
    await db.insert(schema.dailyPrices).values([bar("2020-01-01", "ABC"), bar("2020-03-02", "XYZ"), bar("2021-01-04", "ABC")]);
    await db.insert(schema.symbolChanges).values({ oldSymbol: "ABC", newSymbol: "XYZ", changedOn: "2020-02-01" });
    expect((await companies()).sort()).toEqual(["ABC", "XYZ"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test tests/delivery-research.test.ts`
Expected: FAIL (cannot find `delivery-data`).

- [ ] **Step 3: Implement** `src/research/delivery-data.ts`

```ts
/** Database reads for research 0003. */
import { sql } from "drizzle-orm";
import { db } from "../db";

/**
 * Every company with EQ prices, once, under its latest symbol: a symbol whose
 * every row predates a rename away from it is an old name, loaded through the
 * new symbol's lineage. A ticker reused after its rename has later rows and stays.
 */
export async function companies(): Promise<string[]> {
  const rows = await db.execute<{ symbol: string }>(sql`
    select s.symbol from (select symbol, max(trade_date) as last from daily_prices where series = 'EQ' group by symbol) s
    where not exists (
      select 1 from symbol_changes c where c.old_symbol = s.symbol and s.last < c.changed_on
    )
    order by s.symbol`);
  return rows.map((r) => r.symbol);
}

/** Trading days (bhavcopy 'ok') from `from`, ascending. */
export async function tradingDays(from: string): Promise<string[]> {
  const rows = await db.execute<{ d: string }>(sql`
    select trade_date::text as d from ingest_log
    where source = 'bhavcopy' and status = 'ok' and trade_date >= ${from} order by 1`);
  return rows.map((r) => r.d);
}
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/delivery-research.test.ts`
Expected: all PASS.

- [ ] **Step 5: Write the runner** `src/research/cli-delivery.ts`

```ts
/**
 * Runs research 0003 and prints it as Markdown.
 *
 *   bun run research:delivery > /tmp/out.md
 *
 * Two passes over every company (no history kept in memory): pass 1 builds each
 * day's pool of eligible returns and the cut points; pass 2 finds the signals.
 * Rules are fixed in docs/superpowers/specs/2026-10-04-delivery-study-design.md.
 */
import { sql } from "../db";
import { loadAdjustedHistory, loadRenames } from "../indicators/history";
import { median } from "../indicators/signals";
import { memberWindows } from "./volume-data";
import { STUDY_HORIZONS, fifthCuts, fifthOf, memberFlags } from "./volume";
import { companies, tradingDays } from "./delivery-data";
import {
  DISCOVERY_END, SIGNALS, deliveryVerdict, levelCutsByDate, occasionsOf, part, signalFlags, stockSeries,
  type DeliveryResult, type Occasion, type StockSeries,
} from "./delivery";

const START = "2016-09-28";
const MAIN = STUDY_HORIZONS.indexOf(21);
const LABELS = ["1 week", "2 weeks", "1 month", "3 months", "6 months"];
const f = (v: number | null, d = 1) =>
  v === null ? "—" : Math.abs(v) < 0.5 * 10 ** -d ? (0).toFixed(d) : `${v > 0 ? "+" : ""}${v.toFixed(d)}`;
const out: string[] = [];
const p = (line = "") => out.push(line);
const t0 = Date.now();

const [renames, windows, symbols, days] = await Promise.all([loadRenames(), memberWindows(), companies(), tradingDays(START)]);
const dayIdx = new Map(days.map((d, i) => [d, i]));
const H = STUDY_HORIZONS.length;

async function each(fn: (symbol: string, s: StockSeries) => void) {
  for (const symbol of symbols) {
    const h = await loadAdjustedHistory(symbol, renames);
    if (!h || !h.delivered.some((x) => x != null)) continue;
    fn(symbol, stockSeries(h));
  }
}

// ── pass 1: pools, per-day medians, cut points ──
const pools: number[][][] = Array.from({ length: H }, () => days.map(() => []));
const levelByDate = new Map<string, number[]>();
const discoveryRel: number[] = [];
let eligibleDays = 0;
await each((_, s) => {
  s.dates.forEach((d, i) => {
    const day = dayIdx.get(d);
    if (day === undefined || !s.eligible[i]) return;
    eligibleDays++;
    for (let h = 0; h < H; h++) { const r = s.returns[h]![i]; if (r != null) pools[h]![day]!.push(r); }
    if (s.level[i] != null) (levelByDate.get(d) ?? levelByDate.set(d, []).get(d)!).push(s.level[i]!);
    if (d <= DISCOVERY_END && s.rel[i] != null) discoveryRel.push(s.rel[i]!);
  });
});
const dayMedians = pools.map((ph) => ph.map((v) => median(v)));
const relCuts = fifthCuts(discoveryRel);
const levelCuts = levelCutsByDate(levelByDate);

// ── pass 2: signals ──
// Positions are rebuilt in pass 1's order (same companies, same days), so an
// occasion knows which entry in its day's pool is itself.
const posCount = days.map(() => 0);
const occ: Occasion[][] = SIGNALS.map(() => []);
const nifty: Occasion[][] = SIGNALS.map(() => []);
const byFifth: number[][] = [[], [], [], [], []];
let stocksUsed = 0;
await each((symbol, s) => {
  stocksUsed++;
  const pos = s.dates.map((d, i) => {
    const day = dayIdx.get(d);
    if (day === undefined || !s.eligible[i] || s.returns[MAIN]![i] == null) return -1;
    return posCount[day]!++;
  });
  s.dates.forEach((d, i) => {
    const day = dayIdx.get(d);
    const r = s.returns[MAIN]![i];
    if (day === undefined || !s.eligible[i] || r == null || s.rel[i] == null || d > DISCOVERY_END) return;
    byFifth[fifthOf(s.rel[i]!, relCuts)]!.push(r - dayMedians[MAIN]![day]!);
  });
  const member = memberFlags(s.dates, windows.get(symbol) ?? [], "2020-01-01");
  signalFlags(s, relCuts, (d) => levelCuts.get(d)).forEach((flags, k) => {
    for (const o of occasionsOf(flags, s, (d) => dayIdx.get(d) ?? -1, (i) => pos[i]!)) {
      if (o.day < 0) continue;
      occ[k]!.push(o);
      if (member[s.dates.indexOf(o.date)]) nifty[k]!.push(o);
    }
  });
});

const results: DeliveryResult[] = SIGNALS.map((name, k) => {
  const all = occ[k]!;
  return deliveryVerdict(
    name,
    part(all.filter((o) => o.date <= DISCOVERY_END), pools, dayMedians, MAIN),
    part(all.filter((o) => o.date > DISCOVERY_END), pools, dayMedians, MAIN),
    MAIN,
  );
});

// ── print ──
const luck = (l: { beat: number; direction: string } | null) => (l ? `${l.beat.toFixed(1)}% (${l.direction})` : "—");
p(`Generated ${new Date().toISOString().slice(0, 10)} · ${stocksUsed} companies with delivery data · ${eligibleDays.toLocaleString("en-IN")} eligible stock-days · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
p();
p("## Results (main span: 1 month; discovery 2016–2022, hold-out 2023–)");
p();
p("| Signal | Episodes | Months | Median | Same days, all stocks | Beats random | Same way | Effect | Hold-out episodes | Hold-out median | Hold-out baseline | Hold-out beats | Verdict |");
p("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of results) {
  const d = r.discovery, h = r.holdout;
  p(`| ${r.name} | ${d.n} | ${d.months} | ${f(d.medians[MAIN]!)}% | ${f(d.baseline[MAIN]!)}% | ${luck(d.luck)} | ${r.same} of 4 | ${f(r.effect, 2)} pts | ${h.n} | ${f(h.medians[MAIN]!)}% | ${f(h.baseline[MAIN]!)}% | ${luck(h.luck)} | ${r.verdict} |`);
}
p();
p("## Every span (discovery medians vs same-days baseline)");
p();
p(`| Signal | ${LABELS.join(" | ")} |`);
p(`|---|${LABELS.map(() => "---").join("|")}|`);
for (const r of results) {
  p(`| ${r.name} | ${STUDY_HORIZONS.map((_, h) => `${f(r.discovery.medians[h]!)} vs ${f(r.discovery.baseline[h]!)}`).join(" | ")} |`);
}
p();
p("## Delivery against its own normal, by fifth (discovery, 1 month, return minus that day's median stock)");
p();
p("| Fifth of rel | Stock-days | Median vs the day's typical stock |");
p("|---|---|---|");
byFifth.forEach((v, k) => p(`| ${["Bottom", "Second", "Middle", "Fourth", "Top"][k]} | ${v.length.toLocaleString("en-IN")} | ${f(median(v), 2)} pts |`));
p();
p("## NIFTY 50 members only (from 2020, all years, for context; no verdicts)");
p();
p("| Signal | Episodes | Median, 1 month | Same days, all stocks |");
p("|---|---|---|---|");
SIGNALS.forEach((name, k) => {
  const pt = part(nifty[k]!, pools, dayMedians, MAIN);
  p(`| ${name} | ${pt.n} | ${f(pt.medians[MAIN]!)}% | ${f(pt.baseline[MAIN]!)}% |`);
});
p();
p(`Cut points for "well above / below its own normal" (discovery): ${relCuts.map((c) => c.toFixed(1)).join(", ")} points.`);

console.log(out.join("\n"));
await sql.end();
```

Add to `package.json` scripts after `"research:volume"`:

```json
    "research:delivery": "bun run src/research/cli-delivery.ts",
```

- [ ] **Step 6: Typecheck, then run the study**

Run: `bunx tsc --noEmit && time bun run research:delivery > /private/tmp/claude-501/-Users-4bh1nav-personalProjects-tradeSence/2decf2e3-51f3-4ded-9f1c-bf7e867beaa0/scratchpad/research-0003.md && head -30 /private/tmp/claude-501/-Users-4bh1nav-personalProjects-tradeSence/2decf2e3-51f3-4ded-9f1c-bf7e867beaa0/scratchpad/research-0003.md`
Expected: completes in a few minutes; 8 result rows; companies ≈ 3,700; eligible stock-days in the millions.

- [ ] **Step 7: Spot check delivery % against NSE's printed column** — for INFY 2026-10-01, RELIANCE 2026-10-01 and 20MICRONS 2016-09-28 compute `deliverable_qty / traded_qty * 100` via the postgres MCP and compare with NSE's file (51.96, 61.24, 86.13). Expected: equal to 2 decimals.

- [ ] **Step 8: Commit**

```bash
git add src/research/delivery-data.ts src/research/cli-delivery.ts package.json tests/delivery-research.test.ts
git commit -m "Research 0003: runner (bun run research:delivery)"
```

---

### Task 6: Write-up and docs

**Files:**
- Create: `docs/research/0003-does-delivery-predict.md`
- Create: `docs/decisions/0022-matched-luck-check.md`
- Modify: `docs/decisions/README.md`, `TODO.md`, `README.md`, `CLAUDE.md`

- [ ] **Step 1: Write `docs/research/0003-does-delivery-predict.md`** in research 0002's structure: The question · The short answer (a table: signal, what happened next in plain words, verdict) · How to read the numbers (delivery %, "its own normal", same-days comparison, hold-out, effect bar, months) · Results (paste the runner's tables) · What stands out · Caveats (8 tests; liquid stocks only; costs; five excluded days; hold-out is 3¾ years) · Method (link the spec) · What to build. Every number comes from the run in Task 5; none is typed by hand.

- [ ] **Step 2: Write `docs/decisions/0022-matched-luck-check.md`**: Problem (research 0002's random stock-days flattered bunched signals; CLAUDE.md asked for random dates before a whole-market run) · Options (random stock-days; random dates with one random member; same dates, random other stocks) · Decision (same dates, other stocks) · Why (bunching identical by construction; market direction cancels; calibration test shows ~5% false passes) · Revisit when (re-running research 0002 on the whole market: use `matchedLuck`).

- [ ] **Step 3: Update docs**
  - `docs/decisions/README.md`: rows for 0022 and "Research 0003".
  - `TODO.md`: "Where we left off" + the Delivery item: the verdicts and what follows (build only Build signals; otherwise strike through like Volume A–C).
  - `README.md`: Commands row for `bun run research:delivery`; Function reference section for `src/research/delivery.ts` (functions from Tasks 2–4) and `delivery-data.ts`.
  - `CLAUDE.md`: add `bun run research:delivery` to Commands; in the `docs/research/` paragraph replace "Its random draws treat days as independent … switch to random *dates* before running on the whole market (TODO)." with "Per-stock studies use `matchedLuck` (`src/research/delivery.ts`, decision 0022): each occasion is compared with other eligible stocks on the same date, so bunched signals aren't flattered."

- [ ] **Step 4: Full suite and typecheck**

Run: `bun test && bunx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/research/0003-does-delivery-predict.md docs/decisions/0022-matched-luck-check.md docs/decisions/README.md TODO.md README.md CLAUDE.md
git commit -m "Research 0003 write-up and decision 0022 (matched luck check)"
```
