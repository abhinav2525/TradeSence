# Research 0002: does volume tell us anything? — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A re-runnable study (`bun run research:volume`) that tests 15 volume signals on the NIFTY 50 since 2020 against fixed verdict rules, and its plain-language write-up `docs/research/0002-does-volume-predict.md`.

**Architecture:** Extract `computeIndicators`' per-symbol loader into `src/indicators/history.ts` (shared adjustment + rename lineage). Pure, tested study functions in `src/research/volume.ts`; database reads in `src/research/volume-data.ts`; a CLI `src/research/cli-volume.ts` that assembles and prints Markdown. Nothing is stored.

**Tech Stack:** Bun (runtime + test), TypeScript, Drizzle + Postgres.

**Spec:** `docs/superpowers/specs/2026-10-03-volume-study-design.md`

## Global Constraints

- Textbook settings, never tuned: CMF 20, MFI 14, OBV lookback 20, up-share smoothing 10, panic ≤ 10, stampede ≥ 90, heavy volume `vol_ratio` ≥ 2, light < 1.5.
- Horizons `[5, 10, 21, 63, 126]` sessions; main horizon 63 (market) and 21 (per stock).
- Verdict: Build = n ≥ 8 (market) / ≥ 30 (per stock) AND strength ≥ 97.5 at the main horizon AND same side at ≥ 3 of the other 4 horizons; Maybe = same side ≥ 3 of 4 but not Build; else Don't build.
- Luck check: 1,000 draws, seeded (seed 1), sampling without replacement.
- Prices ÷ `factors`, volume × `shareFactors` (splits/bonuses only, never demergers). Every series restarts at a gap (`segmentByGaps`). No return across a gap.
- Per-stock signals count only on days the stock was a NIFTY 50 member, from 2020-01-01. Episodes merge within `MERGE_GAP` (10).
- Never compare computed returns for exact equality (use `NOISE_PCT`).
- Tests: `bun test` (against `tradesence_test`); typecheck `bunx tsc --noEmit`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A split inside a 20-day window** (KOTAKBANK 1:5, 14 Jan 2026): CMF/MFI/OBV must not jump; covered by the `adjustedBars` test in Task 2.
2. **A renamed member** (ETERNAL, formerly ZOMATO): its history must start before the rename; covered by the `loadAdjustedHistory` test in Task 1.
3. **Ties in the luck check** (many identical medians, e.g. flat returns): must not report a false 100%; covered by the tie test in Task 4.
4. **Too few occasions:** a test with 0 or 1 episode prints "—" and "Don't build", never throws; covered by the `judge` test in Task 4.
5. **A day that is in the index for only part of history** (an ex-member): its signals must stop on `removed_on`; covered by the `memberFlags` test in Task 4.

---

### Task 1: Shared adjusted-history loader

**Files:**
- Create: `src/indicators/history.ts`
- Modify: `src/indicators/compute.ts`
- Test: `tests/history.test.ts` (create); existing `tests/compute.test.ts` must pass unchanged

**Interfaces:**
- Produces: `type Rename = { oldSymbol: string; newSymbol: string; changedOn: string }`, `type History = { dates: string[]; open: number[]; high: number[]; low: number[]; close: number[]; volume: number[]; turnover: number[]; factors: number[]; shareFactors: number[] }`, `loadRenames(): Promise<Rename[]>`, `loadAdjustedHistory(symbol: string, renames: Rename[]): Promise<History | null>`.

- [ ] **Step 1: Write the failing test** — create `tests/history.test.ts`:

```ts
import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { loadAdjustedHistory, loadRenames } from "../src/indicators/history";

const bar = (tradeDate: string, symbol: string, close: number, volume: number) => ({
  tradeDate, symbol, series: "EQ", open: close, high: close + 1, low: close - 1, close, prevClose: close, volume, turnover: close * volume,
});

describe("loadAdjustedHistory", () => {
  beforeEach(async () => {
    for (const t of [schema.dailyPrices, schema.corporateActions, schema.symbolChanges]) await db.delete(t);
  });

  test("joins a renamed company's old symbol and adjusts prices and volume for a split", async () => {
    await db.insert(schema.dailyPrices).values([
      bar("2026-01-01", "OLDCO", 200, 100),
      bar("2026-01-02", "NEWCO", 200, 100),
      bar("2026-01-05", "NEWCO", 100, 200), // 1:2 split ex-date
    ]);
    await db.insert(schema.symbolChanges).values({ oldSymbol: "OLDCO", newSymbol: "NEWCO", changedOn: "2026-01-02" });
    await db.insert(schema.corporateActions).values({
      symbol: "NEWCO", exDate: "2026-01-05", subject: "Split From Rs 10 To Rs 5", series: "EQ", kind: "split", factor: 2,
    });

    const h = await loadAdjustedHistory("NEWCO", await loadRenames());
    expect(h!.dates).toEqual(["2026-01-01", "2026-01-02", "2026-01-05"]);
    expect(h!.high).toEqual([201, 201, 101]);
    expect(h!.low).toEqual([199, 199, 99]);
    expect(h!.factors).toEqual([2, 2, 1]);
    expect(h!.shareFactors).toEqual([2, 2, 1]);
    expect(h!.volume).toEqual([100, 100, 200]); // raw; callers apply shareFactors
  });

  test("no prices: null", async () => {
    expect(await loadAdjustedHistory("NOPE", [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/history.test.ts`
Expected: FAIL, cannot find module `../src/indicators/history`.

- [ ] **Step 3: Implement** — create `src/indicators/history.ts`:

```ts
/**
 * One company's full price history, joined across renames and with its
 * split/bonus/demerger factors: the loader computeIndicators and the research
 * scripts share, so they can never adjust differently (decisions 0002–0004).
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { adjustmentFactors, demergerFactor } from "./adjust";
import { symbolLineage, type LineageEntry } from "../ingest/symbol-changes";

export type Rename = { oldSymbol: string; newSymbol: string; changedOn: string };

export type History = {
  dates: string[];
  open: number[];
  high: number[];
  low: number[];
  close: number[]; // raw bhavcopy prices
  volume: number[]; // raw shares
  turnover: number[];
  factors: number[]; // divide a raw price by this for the adjusted series
  shareFactors: number[]; // multiply raw volume by this (splits/bonuses only, never demergers)
};

/** `symbol = s` restricted to the dates that symbol belonged to this company. */
function inWindow(dateCol: SQL, e: LineageEntry): SQL {
  const parts = [sql`symbol = ${e.symbol}`];
  if (e.from) parts.push(sql`${dateCol} >= ${e.from}`);
  if (e.to) parts.push(sql`${dateCol} < ${e.to}`);
  return sql`(${sql.join(parts, sql` and `)})`;
}

export async function loadRenames(): Promise<Rename[]> {
  return (
    await db.execute<{ old_symbol: string; new_symbol: string; changed_on: string }>(
      sql`select old_symbol, new_symbol, changed_on from symbol_changes`,
    )
  ).map((r) => ({ oldSymbol: r.old_symbol, newSymbol: r.new_symbol, changedOn: r.changed_on }));
}

export async function loadAdjustedHistory(symbol: string, renames: Rename[]): Promise<History | null> {
  const lineage = symbolLineage(symbol, renames);
  const prices = await db.execute<{
    trade_date: string; open: number; high: number; low: number; close: number; volume: number; turnover: number;
  }>(
    sql`select trade_date, open, high, low, close, volume, turnover
        from daily_prices
        where series = 'EQ' and (${sql.join(lineage.map((e) => inWindow(sql`trade_date`, e)), sql` or `)})
        order by trade_date asc`,
  );
  if (prices.length === 0) return null;

  // NSE files past actions under the company's *current* symbol (UNOMINDA's
  // 2022 bonus, while it traded as MINDAIND), so today's symbol is not
  // date-bounded. Older symbols are, in case the ticker was reused. An action
  // listed under both counts once.
  const [current, ...older] = lineage;
  const eventRows = await db.execute<{ ex_date: string; subject: string; kind: string; factor: number }>(
    sql`select distinct on (ex_date, subject) ex_date, subject, kind, factor
        from corporate_actions
        where ((factor is not null and factor <> 1) or kind = 'demerger')
          and (symbol = ${current!.symbol}
               ${older.length ? sql`or ${sql.join(older.map((e) => inWindow(sql`ex_date`, e)), sql` or `)}` : sql``})`,
  );

  const dates = prices.map((p) => p.trade_date);
  const open = prices.map((p) => Number(p.open));
  const close = prices.map((p) => Number(p.close));

  // Splits and bonuses carry their factor; a demerger's comes from prices.
  // One that cannot be priced is left out, and the jump check reports it.
  const events = eventRows.flatMap((e) => {
    const factor = e.kind === "demerger" ? demergerFactor(dates, open, close, e.ex_date) : Number(e.factor);
    return factor === null ? [] : [{ exDate: e.ex_date, factor, demerger: e.kind === "demerger" }];
  });

  return {
    dates,
    open,
    high: prices.map((p) => Number(p.high)),
    low: prices.map((p) => Number(p.low)),
    close,
    volume: prices.map((p) => Number(p.volume)),
    turnover: prices.map((p) => Number(p.turnover)),
    factors: adjustmentFactors(dates, events),
    // Volume is scaled by share-count changes only: a demerger moves the price
    // but leaves the number of shares alone (decision 0008).
    shareFactors: adjustmentFactors(dates, events.filter((e) => !e.demerger)),
  };
}
```

In `src/indicators/compute.ts`:
- Replace the imports of `adjustmentFactors, demergerFactor`, `symbolLineage, LineageEntry` and `type SQL` with `import { loadAdjustedHistory, loadRenames } from "./history";` (keep `findUnexplainedJumps`, `type UnexplainedJump` from `./adjust`, and `sql` from drizzle).
- Delete `inWindow`.
- Replace the `renames` query with `const renames = await loadRenames();`.
- Replace everything in the loop from `const lineage = …` down to and including `const adjusted = closes.map(…)` with:

```ts
    const h = await loadAdjustedHistory(symbol, renames);
    if (!h) continue;
    const { dates, close: closes, factors, shareFactors } = h;
    const volRatio = volumeRatios(dates, h.volume, shareFactors);
    const adjusted = closes.map((c, i) => c / factors[i]!);
```

- In `rows`, change `tradeDate: p.trade_date` → build rows from `dates.map((d, i) => ({ tradeDate: d, symbol, close: closes[i]!, …, turnover: h.turnover[i]! }))`.
- Keep the class doc comment; add one line: `Loading and adjustment live in history.ts, shared with the research scripts.`

- [ ] **Step 4: Run tests**

Run: `bun test tests/history.test.ts tests/compute.test.ts tests/indicators.test.ts && bunx tsc --noEmit`
Expected: all PASS (compute tests unchanged prove the refactor moved nothing).

- [ ] **Step 5: Commit**

```bash
git add src/indicators/history.ts src/indicators/compute.ts tests/history.test.ts
git commit -m "Share the adjusted-history loader between computeIndicators and research

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Volume indicators (CMF, MFI, OBV) on adjusted bars

**Files:**
- Create: `src/research/volume.ts`
- Test: `tests/volume-research.test.ts` (create)

**Interfaces:**
- Consumes: `History` (Task 1); `segmentByGaps`.
- Produces: `CMF_WINDOW = 20`, `MFI_WINDOW = 14`, `type Bars = { dates: string[]; high: number[]; low: number[]; close: number[]; volume: number[] }`, `adjustedBars(h: History): Bars`, `cmf(b: Bars, window?): (number | null)[]`, `mfi(b: Bars, window?): (number | null)[]`, `obv(b: Bars): number[]`.

- [ ] **Step 1: Write the failing tests** — create `tests/volume-research.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import { adjustedBars, cmf, mfi, obv, type Bars } from "../src/research/volume";
import type { History } from "../src/indicators/history";

const day = (i: number) => {
  const d = new Date(Date.UTC(2020, 0, 1));
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
};
const bars = (high: number[], low: number[], close: number[], volume: number[], dates?: string[]): Bars =>
  ({ dates: dates ?? close.map((_, i) => day(i)), high, low, close, volume });

describe("cmf", () => {
  test("hand-worked: closes at high, middle and low", () => {
    const out = cmf(bars([10, 10, 10], [0, 0, 0], [10, 5, 0], [100, 100, 200]), 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeCloseTo(-0.25, 12); // (100 + 0 − 200) ÷ 400
  });
  test("a day with high = low adds volume but no flow", () => {
    expect(cmf(bars([5, 5], [5, 5], [5, 5], [10, 10]), 2)[1]).toBe(0);
  });
  test("restarts after a hole in the data", () => {
    const out = cmf(bars([10, 10, 10], [0, 0, 0], [10, 10, 10], [1, 1, 1], ["2020-01-01", "2020-01-02", "2020-03-01"]), 2);
    expect(out).toEqual([null, 1, null]);
  });
});

describe("mfi", () => {
  test("only rising typical prices: 100", () => {
    expect(mfi(bars([10, 11, 12], [10, 11, 12], [10, 11, 12], [1, 1, 1]), 2)[2]).toBe(100);
  });
  test("hand-worked mixed: 100 − 100 ÷ (1 + 11/10)", () => {
    const out = mfi(bars([10, 11, 10], [10, 11, 10], [10, 11, 10], [1, 1, 1]), 2);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeCloseTo(100 - 100 / 2.1, 12);
  });
  test("unchanged typical price is neither: 50 when no flow either way", () => {
    expect(mfi(bars([10, 10, 10], [10, 10, 10], [10, 10, 10], [1, 1, 1]), 2)[2]).toBe(50);
  });
});

describe("obv", () => {
  test("adds on up closes, subtracts on down, holds on unchanged", () => {
    expect(obv(bars([0, 0, 0, 0], [0, 0, 0, 0], [10, 11, 11, 9], [100, 50, 70, 30]))).toEqual([0, 50, 50, 20]);
  });
  test("restarts at 0 after a hole", () => {
    expect(obv(bars([0, 0, 0], [0, 0, 0], [10, 11, 12], [5, 5, 5], ["2020-01-01", "2020-01-02", "2020-03-01"]))).toEqual([0, 5, 0]);
  });
});

test("adjustedBars: a 1:2 split inside the window looks like no split at all", () => {
  const dates = [day(0), day(1), day(2), day(3)];
  const split: History = {
    dates, open: [200, 200, 100, 100], high: [210, 204, 103, 101], low: [190, 196, 97, 99], close: [200, 202, 100, 100],
    volume: [100, 120, 260, 200], turnover: [0, 0, 0, 0], factors: [2, 2, 1, 1], shareFactors: [2, 2, 1, 1],
  };
  const none: History = {
    dates, open: [100, 100, 100, 100], high: [105, 102, 103, 101], low: [95, 98, 97, 99], close: [100, 101, 100, 100],
    volume: [200, 240, 260, 200], turnover: [0, 0, 0, 0], factors: [1, 1, 1, 1], shareFactors: [1, 1, 1, 1],
  };
  expect(adjustedBars(split)).toEqual(adjustedBars(none));
  expect(cmf(adjustedBars(split), 3)).toEqual(cmf(adjustedBars(none), 3));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/volume-research.test.ts`
Expected: FAIL, cannot find module `../src/research/volume`.

- [ ] **Step 3: Implement** — create `src/research/volume.ts`:

```ts
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

/** Chaikin Money Flow: Σ(money-flow multiplier × volume) ÷ Σ volume over `window` sessions. */
export function cmf(b: Bars, window = CMF_WINDOW): (number | null)[] {
  const out: (number | null)[] = new Array(b.close.length).fill(null);
  for (const seg of segmentByGaps(b.dates)) {
    let flow = 0;
    let vol = 0;
    seg.forEach((i, j) => {
      const range = b.high[i]! - b.low[i]!;
      const mfm = range === 0 ? 0 : ((b.close[i]! - b.low[i]!) - (b.high[i]! - b.close[i]!)) / range;
      flow += mfm * b.volume[i]!;
      vol += b.volume[i]!;
      if (j >= window) {
        const k = seg[j - window]!;
        const r = b.high[k]! - b.low[k]!;
        flow -= (r === 0 ? 0 : ((b.close[k]! - b.low[k]!) - (b.high[k]! - b.close[k]!)) / r) * b.volume[k]!;
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
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/volume-research.test.ts && bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/research/volume.ts tests/volume-research.test.ts
git commit -m "Research 0002: CMF, MFI and OBV on split-adjusted bars

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Signal flags (market-wide and per stock)

**Files:**
- Modify: `src/research/volume.ts`
- Test: `tests/volume-research.test.ts`

**Interfaces:**
- Produces: `PANIC = 10`, `STAMPEDE = 90`, `SHARE_SMOOTH = 10`, `OBV_LOOKBACK = 20`, `HEAVY = 2`, `LIGHT = 1.5`, `upShare(up: number, down: number): number | null`, `rollingMean(dates: string[], v: (number | null)[], window: number): (number | null)[]`, `panicThenStampede(dates: string[], share: (number | null)[]): boolean[]`, `quietFlags(b: Bars, ob: number[], lookback?): { buying: boolean[]; selling: boolean[] }`, `crossFlags(dates: string[], close: number[], ma: (number | null)[], volRatio: (number | null)[]): { aboveHeavy: boolean[]; aboveLight: boolean[]; belowHeavy: boolean[]; belowLight: boolean[] }`.

- [ ] **Step 1: Write the failing tests** — append to `tests/volume-research.test.ts` (and add the new names to the import line):

```ts
describe("market-wide", () => {
  test("upShare: % of traded value in rising stocks; exactly 90 and 10 are kept exact", () => {
    expect(upShare(300, 100)).toBe(75);
    expect(upShare(90, 10)).toBe(90);
    expect(upShare(10, 90)).toBe(10);
    expect(upShare(0, 0)).toBeNull();
  });
  test("rollingMean: null until the window fills, and for any window holding a null", () => {
    expect(rollingMean([day(0), day(1), day(2), day(3)], [1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
    expect(rollingMean([day(0), day(1), day(2)], [1, null, 3], 2)).toEqual([null, null, null]);
  });
  test("panicThenStampede: a stampede within 10 sessions after a panic", () => {
    const d = (n: number) => Array.from({ length: n }, (_, i) => day(i));
    expect(panicThenStampede(d(3), [5, 50, 95])).toEqual([false, false, true]);
    expect(panicThenStampede(d(11), [5, ...Array(9).fill(50), 95])[10]).toBe(true); // 10 after
    expect(panicThenStampede(d(12), [5, ...Array(10).fill(50), 95])[11]).toBe(false); // 11 after
    expect(panicThenStampede(d(2), [95, 5])).toEqual([false, false]); // wrong order
  });
});

describe("per stock", () => {
  test("quietFlags: price down while OBV up is quiet buying, and the reverse", () => {
    const b = bars([0, 0], [0, 0], [10, 9], [0, 0]);
    expect(quietFlags(b, [0, 50], 1)).toEqual({ buying: [false, true], selling: [false, false] });
    expect(quietFlags(bars([0, 0], [0, 0], [10, 11], [0, 0]), [0, -5], 1).selling).toEqual([false, true]);
  });
  test("crossFlags: heavy ≥ 2×, light < 1.5×, in between is neither; needs both averages and no hole", () => {
    const dates = [day(0), day(1)];
    expect(crossFlags(dates, [9, 11], [10, 10], [1, 2]).aboveHeavy).toEqual([false, true]);
    expect(crossFlags(dates, [9, 11], [10, 10], [1, 1.2]).aboveLight).toEqual([false, true]);
    const mid = crossFlags(dates, [9, 11], [10, 10], [1, 1.7]);
    expect(mid.aboveHeavy[1] || mid.aboveLight[1]).toBe(false);
    expect(crossFlags(dates, [11, 9], [10, 10], [1, 3]).belowHeavy).toEqual([false, true]);
    expect(crossFlags(dates, [9, 11], [null, 10], [1, 3]).aboveHeavy[1]).toBe(false);
    expect(crossFlags(["2020-01-01", "2020-03-01"], [9, 11], [10, 10], [1, 3]).aboveHeavy[1]).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/volume-research.test.ts`
Expected: FAIL (missing exports).

- [ ] **Step 3: Implement** — append to `src/research/volume.ts`:

```ts
export const PANIC = 10; // ≤ 10% of traded value in rising stocks: a 90% down day
export const STAMPEDE = 90; // ≥ 90%: a 90% up day
export const SHARE_SMOOTH = 10;
export const OBV_LOOKBACK = 20;
export const HEAVY = 2; // vol_ratio: twice the 20-day normal
export const LIGHT = 1.5;
const PAIR_WINDOW = 10; // sessions from a panic day to its stampede day

/** % of the day's traded value (₹) that went into rising stocks; null when nothing moved. */
export function upShare(up: number, down: number): number | null {
  return up + down > 0 ? (up / (up + down)) * 100 : null;
}

const sameSegment = (dates: string[]) => {
  const seg = new Array<number>(dates.length);
  segmentByGaps(dates).forEach((s, k) => s.forEach((i) => (seg[i] = k)));
  return seg;
};

/** Mean of the last `window` values within a segment; null if any of them is null. */
export function rollingMean(dates: string[], v: (number | null)[], window: number): (number | null)[] {
  const seg = sameSegment(dates);
  return v.map((_, i) => {
    if (i < window - 1 || seg[i - window + 1] !== seg[i]) return null;
    const w = v.slice(i - window + 1, i + 1);
    return w.some((x) => x === null) ? null : (w as number[]).reduce((s, x) => s + x, 0) / window;
  });
}

/** True on a stampede day that comes within 10 sessions after a panic day (same segment). */
export function panicThenStampede(dates: string[], share: (number | null)[]): boolean[] {
  const seg = sameSegment(dates);
  return share.map((s, i) => {
    if (s === null || s < STAMPEDE) return false;
    for (let j = Math.max(0, i - PAIR_WINDOW); j < i; j++) {
      const p = share[j];
      if (seg[j] === seg[i] && p !== null && p <= PANIC) return true;
    }
    return false;
  });
}

/** Quiet buying: price down over `lookback` sessions while OBV rose. Quiet selling: the reverse. */
export function quietFlags(b: Bars, ob: number[], lookback = OBV_LOOKBACK): { buying: boolean[]; selling: boolean[] } {
  const seg = sameSegment(b.dates);
  const buying = new Array<boolean>(b.close.length).fill(false);
  const selling = new Array<boolean>(b.close.length).fill(false);
  for (let i = lookback; i < b.close.length; i++) {
    if (seg[i - lookback] !== seg[i]) continue;
    const price = b.close[i]! - b.close[i - lookback]!;
    const flow = ob[i]! - ob[i - lookback]!;
    buying[i] = price < 0 && flow > 0;
    selling[i] = price > 0 && flow < 0;
  }
  return { buying, selling };
}

/**
 * Crossings of an average (the Screener's rule: yesterday at or below, today
 * above, both averages present, no hole), split by the day's volume ratio.
 */
export function crossFlags(dates: string[], close: number[], ma: (number | null)[], volRatio: (number | null)[]) {
  const seg = sameSegment(dates);
  const n = close.length;
  const out = {
    aboveHeavy: new Array<boolean>(n).fill(false),
    aboveLight: new Array<boolean>(n).fill(false),
    belowHeavy: new Array<boolean>(n).fill(false),
    belowLight: new Array<boolean>(n).fill(false),
  };
  for (let i = 1; i < n; i++) {
    const a = ma[i - 1];
    const b = ma[i];
    const vr = volRatio[i];
    if (a === null || a === undefined || b === null || b === undefined || seg[i - 1] !== seg[i] || vr === null || vr === undefined) continue;
    const up = close[i - 1]! <= a && close[i]! > b;
    const down = close[i - 1]! > a && close[i]! <= b;
    const heavy = vr >= HEAVY;
    const light = vr < LIGHT;
    out.aboveHeavy[i] = up && heavy;
    out.aboveLight[i] = up && light;
    out.belowHeavy[i] = down && heavy;
    out.belowLight[i] = down && light;
  }
  return out;
}
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/volume-research.test.ts && bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/research/volume.ts tests/volume-research.test.ts
git commit -m "Research 0002: market and per-stock volume signal flags

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Study machinery (returns, fifths, luck check, verdict)

**Files:**
- Modify: `src/research/volume.ts`
- Test: `tests/volume-research.test.ts`

**Interfaces:**
- Consumes: `forwardReturnSafe`, `median`, `segmentIds` (`src/indicators/signals.ts`); `findEpisodeSpans`, `MERGE_GAP`; `NOISE_PCT`.
- Produces: `STUDY_HORIZONS = [5, 10, 21, 63, 126] as const`, `DRAWS = 1000`, `LUCK_BAR = 97.5`, `MIN_MARKET = 8`, `MIN_STOCK = 30`, `type Verdict = "Build" | "Maybe" | "Don't build"`, `type Luck = { beat: number; direction: "better" | "worse"; strength: number }`, `type Occasion = { date: string; returns: (number | null)[] }`, `type TestResult = { name: string; feeds: string; n: number; months: number; main: number; medians: (number | null)[]; baseline: (number | null)[]; luck: Luck | null; same: number; verdict: Verdict }`, `excessReturn(close, seg, dates, nifty: Map<string, number>, i, h): number | null`, `quantile(sorted: number[], p: number): number`, `fifthOf(v: number, cuts: number[]): number`, `fifthCuts(values: number[]): number[]`, `memberFlags(dates: string[], windows: { addedOn: string; removedOn: string | null }[], from: string): boolean[]`, `episodeStarts(flags: boolean[]): number[]`, `mulberry32(seed: number): () => number`, `luckCheck(signal: number[], pool: number[], draws?, seed?): Luck | null`, `sameWay(medians, baseline, main): number`, `verdictOf(n, min, luck, same): Verdict`, `judge(name, feeds, occasions: Occasion[], pool: number[][], main: number, min: number): TestResult`, `distinctMonths(dates: string[]): number`.

- [ ] **Step 1: Write the failing tests** — append (and extend the import):

```ts
describe("study machinery", () => {
  test("excessReturn: stock minus NIFTY over the same sessions; null without both", () => {
    const dates = [day(0), day(1)];
    const nifty = new Map([[day(0), 100], [day(1), 105]]);
    expect(excessReturn([100, 110], [0, 0], dates, nifty, 0, 1)).toBeCloseTo(5, 12);
    expect(excessReturn([100, 110], [0, 0], dates, new Map([[day(0), 100]]), 0, 1)).toBeNull();
    expect(excessReturn([100, 110], [0, 1], dates, nifty, 0, 1)).toBeNull(); // a hole
  });

  test("fifths: cut points and which fifth a value falls in", () => {
    const cuts = fifthCuts([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(cuts).toEqual([2.8, 4.6, 6.4, 8.2]);
    expect([1, 2.8, 5, 9, 10].map((v) => fifthOf(v, cuts))).toEqual([0, 1, 2, 4, 4]);
  });

  test("memberFlags: only on days inside a membership window, from the start date", () => {
    const dates = ["2019-12-31", "2020-01-02", "2021-06-01", "2021-07-01"];
    expect(memberFlags(dates, [{ addedOn: "2019-01-01", removedOn: "2021-07-01" }], "2020-01-01")).toEqual([false, true, true, false]);
  });

  test("episodeStarts merges within 10 sessions", () => {
    const f = [true, ...Array(10).fill(false), true, ...Array(11).fill(false), true];
    expect(episodeStarts(f)).toEqual([0, 23]);
  });

  test("luckCheck is reproducible and spots a clearly better signal", () => {
    const pool = Array.from({ length: 500 }, (_, i) => i - 250);
    const a = luckCheck([200, 210, 220, 230, 240], pool);
    expect(a).toEqual(luckCheck([200, 210, 220, 230, 240], pool));
    expect(a!.direction).toBe("better");
    expect(a!.strength).toBeGreaterThan(99);
    expect(luckCheck([], pool)).toBeNull();
  });

  test("luckCheck: ties count half, so a flat pool is never 'unusual'", () => {
    const r = luckCheck([0, 0, 0], Array(100).fill(0));
    expect(r!.strength).toBe(50);
  });

  test("luckCheck: a signal that is just random days passes the 97.5 bar about 5% of the time", () => {
    const pool = Array.from({ length: 400 }, (_, i) => Math.sin(i * 12.9898) * 10);
    const rand = mulberry32(42);
    let passes = 0;
    const trials = 200;
    for (let t = 0; t < trials; t++) {
      const sample = Array.from({ length: 12 }, () => pool[Math.floor(rand() * pool.length)]!);
      if (luckCheck(sample, pool, 400, t + 1)!.strength >= LUCK_BAR) passes++;
    }
    expect(passes / trials).toBeGreaterThan(0.01);
    expect(passes / trials).toBeLessThan(0.11);
  });

  test("sameWay counts the other horizons on the main horizon's side of the baseline", () => {
    expect(sameWay([1, 2, 3, 4, 5], [0, 0, 0, 0, 0], 2)).toBe(4);
    expect(sameWay([1, -2, 3, null, 0], [0, 0, 0, 0, 0], 2)).toBe(1);
  });

  test("verdictOf", () => {
    const strong = { beat: 99, direction: "better" as const, strength: 99 };
    expect(verdictOf(40, 30, strong, 3)).toBe("Build");
    expect(verdictOf(10, 30, strong, 3)).toBe("Maybe"); // too few
    expect(verdictOf(40, 30, { beat: 90, direction: "better", strength: 90 }, 4)).toBe("Maybe");
    expect(verdictOf(40, 30, strong, 2)).toBe("Don't build");
    expect(verdictOf(0, 30, null, 0)).toBe("Don't build");
  });

  test("judge: no occasions gives — and Don't build, never throws", () => {
    const r = judge("x", "A", [], [[1], [1], [1], [1], [1]], 2, 8);
    expect(r).toMatchObject({ n: 0, months: 0, luck: null, verdict: "Don't build" });
    expect(r.medians).toEqual([null, null, null, null, null]);
  });

  test("distinctMonths", () => {
    expect(distinctMonths(["2020-03-02", "2020-03-20", "2022-06-16"])).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/volume-research.test.ts`
Expected: FAIL (missing exports).

- [ ] **Step 3: Implement** — append to `src/research/volume.ts` (and add the imports at the top: `import { findEpisodeSpans, MERGE_GAP } from "../indicators/episodes";`, `import { forwardReturnSafe, median } from "../indicators/signals";`, `import { NOISE_PCT } from "../indicators/risk";`):

```ts
export const STUDY_HORIZONS = [5, 10, 21, 63, 126] as const; // sessions: 1w, 2w, 1m, 3m, 6m
export const DRAWS = 1000;
export const LUCK_BAR = 97.5; // two-sided 95%: only 1 random pick in 20 is this unusual
export const MIN_MARKET = 8;
export const MIN_STOCK = 30;

export type Verdict = "Build" | "Maybe" | "Don't build";
export type Luck = { beat: number; direction: "better" | "worse"; strength: number };
export type Occasion = { date: string; returns: (number | null)[] }; // one per STUDY_HORIZONS
export type TestResult = {
  name: string;
  feeds: string; // which later project it would feed: A, B or C
  n: number; // occasions with a main-horizon return
  months: number; // distinct calendar months those occasions start in
  main: number; // index into STUDY_HORIZONS
  medians: (number | null)[];
  baseline: (number | null)[];
  luck: Luck | null;
  same: number; // other horizons on the main horizon's side of the baseline
  verdict: Verdict;
};

/** The stock's return minus the NIFTY 50's over the same sessions; null without both, or across a hole. */
export function excessReturn(
  close: number[], seg: number[], dates: string[], nifty: Map<string, number>, i: number, h: number,
): number | null {
  const r = forwardReturnSafe(close, seg, i, h);
  if (r === null) return null;
  const a = nifty.get(dates[i]!);
  const b = nifty.get(dates[i + h]!);
  return a === undefined || b === undefined ? null : r - (b / a - 1) * 100;
}

/** Linear-interpolated quantile of an ascending list. */
export function quantile(sorted: number[], p: number): number {
  const pos = p * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export function fifthCuts(values: number[]): number[] {
  const s = [...values].sort((a, b) => a - b);
  return [0.2, 0.4, 0.6, 0.8].map((p) => quantile(s, p));
}

/** 0 = bottom fifth … 4 = top fifth. */
export function fifthOf(v: number, cuts: number[]): number {
  let k = 0;
  while (k < cuts.length && v >= cuts[k]!) k++;
  return k;
}

/** True on days inside a membership window (added_on ≤ d < removed_on) and on or after `from`. */
export function memberFlags(dates: string[], windows: { addedOn: string; removedOn: string | null }[], from: string): boolean[] {
  return dates.map((d) => d >= from && windows.some((w) => d >= w.addedOn && (w.removedOn === null || d < w.removedOn)));
}

export function episodeStarts(flags: boolean[]): number[] {
  return findEpisodeSpans(flags.map((f) => (f ? 1 : 0)), (p) => p === 1, MERGE_GAP).map((s) => s.start);
}

/** A small seeded generator, so the luck check gives the same answer every run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * How unusual is the signal's median? Draw as many random days from `pool`
 * (without replacement) `draws` times; beat = % of draws whose median is below
 * the signal's (ties count half). Strength = the larger of beat and 100 − beat.
 */
export function luckCheck(signal: number[], pool: number[], draws = DRAWS, seed = 1): Luck | null {
  const k = signal.length;
  if (k === 0 || pool.length < k) return null;
  const target = median(signal)!;
  const rand = mulberry32(seed);
  const arr = pool.slice();
  let below = 0;
  for (let d = 0; d < draws; d++) {
    for (let t = 0; t < k; t++) {
      const r = t + Math.floor(rand() * (arr.length - t));
      [arr[t], arr[r]] = [arr[r]!, arr[t]!];
    }
    const m = median(arr.slice(0, k))!;
    if (m < target - NOISE_PCT) below += 1;
    else if (Math.abs(m - target) <= NOISE_PCT) below += 0.5;
  }
  const beat = (below / draws) * 100;
  return { beat, direction: beat >= 50 ? "better" : "worse", strength: Math.max(beat, 100 - beat) };
}

/** How many of the other horizons sit on the same side of the baseline as the main one. */
export function sameWay(medians: (number | null)[], baseline: (number | null)[], main: number): number {
  const side = (i: number) => {
    const m = medians[i];
    const b = baseline[i];
    if (m === null || m === undefined || b === null || b === undefined) return 0;
    const d = m - b;
    return d > NOISE_PCT ? 1 : d < -NOISE_PCT ? -1 : 0;
  };
  const s = side(main);
  if (s === 0) return 0;
  return medians.filter((_, i) => i !== main && side(i) === s).length;
}

export function verdictOf(n: number, min: number, luck: Luck | null, same: number): Verdict {
  if (n >= min && luck !== null && luck.strength >= LUCK_BAR && same >= 3) return "Build";
  if (same >= 3) return "Maybe";
  return "Don't build";
}

export function distinctMonths(dates: string[]): number {
  return new Set(dates.map((d) => d.slice(0, 7))).size;
}

/** One test's full result. `pool[h]` holds every eligible day's return at horizon h. */
export function judge(name: string, feeds: string, occasions: Occasion[], pool: number[][], main: number, min: number): TestResult {
  const at = (h: number) => occasions.map((o) => o.returns[h]).filter((v): v is number => v !== null && v !== undefined);
  const medians = STUDY_HORIZONS.map((_, h) => median(at(h)));
  const baseline = STUDY_HORIZONS.map((_, h) => median(pool[h] ?? []));
  const mainVals = at(main);
  const luck = luckCheck(mainVals, pool[main] ?? []);
  const same = sameWay(medians, baseline, main);
  const counted = occasions.filter((o) => o.returns[main] !== null && o.returns[main] !== undefined);
  return {
    name, feeds, main, medians, baseline, luck, same,
    n: mainVals.length,
    months: distinctMonths(counted.map((o) => o.date)),
    verdict: verdictOf(mainVals.length, min, luck, same),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/volume-research.test.ts && bunx tsc --noEmit`
Expected: PASS. If the "about 5%" test lands outside 1–11%, check the sampling (it must be without replacement and re-shuffle per draw), never widen the bounds.

- [ ] **Step 5: Commit**

```bash
git add src/research/volume.ts tests/volume-research.test.ts
git commit -m "Research 0002: forward returns vs NIFTY, fifths, seeded luck check and verdict rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Data loaders

**Files:**
- Create: `src/research/volume-data.ts`
- Test: `tests/volume-data.test.ts` (create)

**Interfaces:**
- Consumes: `loadAdjustedHistory`, `loadRenames` (Task 1).
- Produces: `type MarketDay = { date: string; up: number; down: number }`, `marketTurnover(indexName?): Promise<MarketDay[]>`, `niftyCloses(): Promise<Map<string, number>>`, `memberWindows(indexName?): Promise<Map<string, { addedOn: string; removedOn: string | null }[]>>`, `stockIndicators(symbol: string): Promise<Map<string, { sma200: number | null; volRatio: number | null; close: number }>>`.

- [ ] **Step 1: Write the failing test** — create `tests/volume-data.test.ts`:

```ts
import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { marketTurnover, memberWindows, niftyCloses, stockIndicators } from "../src/research/volume-data";

const ind = (tradeDate: string, symbol: string, changePct: number | null, turnover: number) =>
  ({ tradeDate, symbol, close: 100, sma50: 100, sma200: 99, ema200: 100, changePct, volRatio: 1.2, turnover });

describe("volume-data", () => {
  beforeEach(async () => {
    for (const t of [schema.dailyIndicators, schema.indexMembers, schema.indexPrices]) await db.delete(t);
  });

  test("marketTurnover sums ₹ turnover of rising and falling members, per date, members only", async () => {
    await db.insert(schema.indexMembers).values([
      { indexName: "NIFTY50", symbol: "UP", addedOn: "2020-01-01", removedOn: null },
      { indexName: "NIFTY50", symbol: "DN", addedOn: "2020-01-01", removedOn: null },
      { indexName: "NIFTY50", symbol: "GONE", addedOn: "2020-01-01", removedOn: "2026-01-01" },
    ]);
    await db.insert(schema.dailyIndicators).values([
      ind("2026-10-01", "UP", 1, 300), ind("2026-10-01", "DN", -1, 100), ind("2026-10-01", "GONE", 2, 999),
      ind("2026-10-01", "OUTSIDER", 3, 500),
    ]);
    expect(await marketTurnover()).toEqual([{ date: "2026-10-01", up: 300, down: 100 }]);
  });

  test("memberWindows, niftyCloses and stockIndicators", async () => {
    await db.insert(schema.indexMembers).values({ indexName: "NIFTY50", symbol: "UP", addedOn: "2020-01-01", removedOn: "2024-03-28" });
    await db.insert(schema.indexPrices).values({ tradeDate: "2026-10-01", indexName: "Nifty 50", close: 24000 });
    await db.insert(schema.dailyIndicators).values(ind("2026-10-01", "UP", 1, 300));
    expect((await memberWindows()).get("UP")).toEqual([{ addedOn: "2020-01-01", removedOn: "2024-03-28" }]);
    expect((await niftyCloses()).get("2026-10-01")).toBe(24000);
    expect((await stockIndicators("UP")).get("2026-10-01")).toEqual({ sma200: 99, volRatio: 1.2, close: 100 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/volume-data.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** — create `src/research/volume-data.ts`:

```ts
/** Database reads for research 0002. Membership is joined per trade date, as everywhere. */
import { sql } from "drizzle-orm";
import { db } from "../db";

const INDEX = "Nifty 50"; // NSE's name in index_prices

export type MarketDay = { date: string; up: number; down: number };

/** Per session: ₹ turnover of that day's members that rose, and that fell. */
export async function marketTurnover(indexName = "NIFTY50"): Promise<MarketDay[]> {
  const rows = await db.execute<{ date: string; up: number; down: number }>(sql`
    select i.trade_date::text as date,
           coalesce(sum(i.turnover) filter (where i.change_pct > 0), 0) as up,
           coalesce(sum(i.turnover) filter (where i.change_pct < 0), 0) as down
    from daily_indicators i
    join index_members m
      on m.symbol = i.symbol
     and m.index_name = ${indexName}
     and i.trade_date >= m.added_on
     and (m.removed_on is null or i.trade_date < m.removed_on)
    where i.change_pct is not null
    group by i.trade_date
    order by i.trade_date asc
  `);
  return rows.map((r) => ({ date: r.date, up: Number(r.up), down: Number(r.down) }));
}

export async function niftyCloses(): Promise<Map<string, number>> {
  const rows = await db.execute<{ d: string; close: number }>(
    sql`select trade_date::text d, close from index_prices where index_name = ${INDEX}`,
  );
  return new Map(rows.map((r) => [r.d, Number(r.close)]));
}

export async function memberWindows(indexName = "NIFTY50"): Promise<Map<string, { addedOn: string; removedOn: string | null }[]>> {
  const rows = await db.execute<{ symbol: string; added_on: string; removed_on: string | null }>(
    sql`select symbol, added_on::text, removed_on::text from index_members where index_name = ${indexName}`,
  );
  const out = new Map<string, { addedOn: string; removedOn: string | null }[]>();
  for (const r of rows) {
    const list = out.get(r.symbol) ?? [];
    list.push({ addedOn: r.added_on, removedOn: r.removed_on });
    out.set(r.symbol, list);
  }
  return out;
}

/** The stored 200-day SMA (in each day's rupees), volume ratio and raw close, by date. */
export async function stockIndicators(symbol: string): Promise<Map<string, { sma200: number | null; volRatio: number | null; close: number }>> {
  const rows = await db.execute<{ d: string; sma_200: number | null; vol_ratio: number | null; close: number }>(
    sql`select trade_date::text d, sma_200, vol_ratio, close from daily_indicators where symbol = ${symbol}`,
  );
  return new Map(rows.map((r) => [r.d, {
    sma200: r.sma_200 === null ? null : Number(r.sma_200),
    volRatio: r.vol_ratio === null ? null : Number(r.vol_ratio),
    close: Number(r.close),
  }]));
}
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/volume-data.test.ts && bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/research/volume-data.ts tests/volume-data.test.ts
git commit -m "Research 0002: data loaders (market turnover, NIFTY closes, membership, stock indicators)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The runner (`bun run research:volume`)

**Files:**
- Create: `src/research/cli-volume.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: everything from Tasks 1–5.

- [ ] **Step 1: Add the script** — in `package.json` scripts, after `research:forward-returns`:

```json
    "research:volume": "bun run src/research/cli-volume.ts",
```

- [ ] **Step 2: Write the runner** — create `src/research/cli-volume.ts`:

```ts
/**
 * Runs research 0002 and prints it as Markdown.
 *
 *   bun run research:volume > /tmp/out.md
 *   bun run research:volume -- --check RELIANCE,INFY   # latest CMF/MFI, for the TradingView comparison
 *
 * Verdict rules are fixed in the spec before results: docs/superpowers/specs/2026-10-03-volume-study-design.md.
 */
import { sql } from "../db";
import { loadAdjustedHistory, loadRenames } from "../indicators/history";
import { forwardReturnSafe, median, segmentIds } from "../indicators/signals";
import { marketTurnover, memberWindows, niftyCloses, stockIndicators } from "./volume-data";
import {
  MIN_MARKET, MIN_STOCK, PANIC, SHARE_SMOOTH, STAMPEDE, STUDY_HORIZONS,
  adjustedBars, cmf, crossFlags, episodeStarts, excessReturn, fifthCuts, fifthOf, judge, memberFlags, mfi, obv,
  panicThenStampede, quietFlags, rollingMean, upShare, type Occasion, type TestResult,
} from "./volume";

const FROM = "2020-01-01";
const MARKET_MAIN = STUDY_HORIZONS.indexOf(63);
const STOCK_MAIN = STUDY_HORIZONS.indexOf(21);
const LABELS = ["1 week", "2 weeks", "1 month", "3 months", "6 months"];

const f = (v: number | null, d = 1) => (v === null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(d)}`);
const out: string[] = [];
const p = (line = "") => out.push(line);

const check = process.argv.includes("--check") ? (process.argv[process.argv.indexOf("--check") + 1] ?? "").split(",") : null;

const [nifty, windows, renames, market] = await Promise.all([niftyCloses(), memberWindows(), loadRenames(), marketTurnover()]);

if (check) {
  for (const symbol of check) {
    const h = await loadAdjustedHistory(symbol, renames);
    if (!h) { console.log(`${symbol}: no data`); continue; }
    const b = adjustedBars(h);
    const i = b.close.length - 1;
    console.log(`${symbol} ${b.dates[i]}: CMF(20) ${cmf(b)[i]?.toFixed(4)}  MFI(14) ${mfi(b)[i]?.toFixed(2)}`);
  }
  await sql.end();
  process.exit(0);
}

// ── market-wide ──
const mDays = market.filter((d) => d.date >= FROM && nifty.has(d.date));
const mDates = mDays.map((d) => d.date);
const mSeg = segmentIds(mDates);
const mClose = mDates.map((d) => nifty.get(d)!);
const share = mDays.map((d) => upShare(d.up, d.down));
const share10 = rollingMean(mDates, share, SHARE_SMOOTH);
const mRet = (i: number) => STUDY_HORIZONS.map((h) => forwardReturnSafe(mClose, mSeg, i, h));
const mPool = STUDY_HORIZONS.map((h) => mDates.map((_, i) => forwardReturnSafe(mClose, mSeg, i, h)).filter((v): v is number => v !== null));
const s10Cuts = fifthCuts(share10.filter((v): v is number => v !== null));
const mOcc = (flags: boolean[]): Occasion[] => episodeStarts(flags).map((i) => ({ date: mDates[i]!, returns: mRet(i) }));

const results: TestResult[] = [
  judge("Panic day (≥ 90% of value into falling stocks)", "A", mOcc(share.map((s) => s !== null && s <= PANIC)), mPool, MARKET_MAIN, MIN_MARKET),
  judge("Stampede day (≥ 90% into rising stocks)", "A", mOcc(share.map((s) => s !== null && s >= STAMPEDE)), mPool, MARKET_MAIN, MIN_MARKET),
  judge("Panic then stampede within 10 sessions", "A", mOcc(panicThenStampede(mDates, share)), mPool, MARKET_MAIN, MIN_MARKET),
  judge("10-day up-volume share in its top fifth", "A", mOcc(share10.map((s) => s !== null && fifthOf(s, s10Cuts) === 4)), mPool, MARKET_MAIN, MIN_MARKET),
  judge("10-day up-volume share in its bottom fifth", "A", mOcc(share10.map((s) => s !== null && fifthOf(s, s10Cuts) === 0)), mPool, MARKET_MAIN, MIN_MARKET),
];

// ── per stock ──
type StockDay = { cmf: number | null; ex: (number | null)[] };
const stockTests: Record<string, { feeds: string; occ: Occasion[] }> = {
  "MFI under 20 (oversold)": { feeds: "B", occ: [] },
  "MFI over 80 (overbought)": { feeds: "B", occ: [] },
  "Quiet buying (price down, OBV up over 20 sessions)": { feeds: "B, C", occ: [] },
  "Quiet selling (price up, OBV down over 20 sessions)": { feeds: "B, C", occ: [] },
  "Cross above the 200-day SMA on heavy volume (≥ 2×)": { feeds: "C", occ: [] },
  "Cross above the 200-day SMA on light volume (< 1.5×)": { feeds: "C", occ: [] },
  "Cross below the 200-day SMA on heavy volume": { feeds: "C", occ: [] },
  "Cross below the 200-day SMA on light volume": { feeds: "C", occ: [] },
};
const perStock: { symbol: string; dates: string[]; member: boolean[]; days: StockDay[] }[] = [];
const sPool: number[][] = STUDY_HORIZONS.map(() => []);

for (const [symbol, win] of windows) {
  const h = await loadAdjustedHistory(symbol, renames);
  if (!h) continue;
  const b = adjustedBars(h);
  const seg = segmentIds(b.dates);
  const member = memberFlags(b.dates, win, FROM);
  const c = cmf(b);
  const m = mfi(b);
  const q = quietFlags(b, obv(b));
  const ind = await stockIndicators(symbol);
  const x = crossFlags(
    b.dates,
    h.close, // raw close vs the stored average in each day's rupees: like for like
    b.dates.map((d) => ind.get(d)?.sma200 ?? null),
    b.dates.map((d) => ind.get(d)?.volRatio ?? null),
  );
  const days: StockDay[] = b.dates.map((_, i) => ({
    cmf: c[i] ?? null,
    ex: STUDY_HORIZONS.map((hz) => excessReturn(b.close, seg, b.dates, nifty, i, hz)),
  }));
  days.forEach((d, i) => { if (member[i]) d.ex.forEach((v, k) => { if (v !== null) sPool[k]!.push(v); }); });
  perStock.push({ symbol, dates: b.dates, member, days });

  const add = (name: string, flags: boolean[]) => {
    for (const i of episodeStarts(flags.map((fl, k) => fl && member[k]!))) {
      stockTests[name]!.occ.push({ date: b.dates[i]!, returns: days[i]!.ex });
    }
  };
  add("MFI under 20 (oversold)", m.map((v) => v !== null && v < 20));
  add("MFI over 80 (overbought)", m.map((v) => v !== null && v > 80));
  add("Quiet buying (price down, OBV up over 20 sessions)", q.buying);
  add("Quiet selling (price up, OBV down over 20 sessions)", q.selling);
  add("Cross above the 200-day SMA on heavy volume (≥ 2×)", x.aboveHeavy);
  add("Cross above the 200-day SMA on light volume (< 1.5×)", x.aboveLight);
  add("Cross below the 200-day SMA on heavy volume", x.belowHeavy);
  add("Cross below the 200-day SMA on light volume", x.belowLight);
}

// CMF fifths need cut points from every member-day first.
const cmfCuts = fifthCuts(perStock.flatMap((s) => s.days.filter((d, i) => s.member[i] && d.cmf !== null).map((d) => d.cmf!)));
for (const [name, k] of [["CMF(20) in its top fifth", 4], ["CMF(20) in its bottom fifth", 0]] as const) {
  const occ: Occasion[] = [];
  for (const s of perStock) {
    const flags = s.days.map((d, i) => s.member[i]! && d.cmf !== null && fifthOf(d.cmf, cmfCuts) === k);
    for (const i of episodeStarts(flags)) occ.push({ date: s.dates[i]!, returns: s.days[i]!.ex });
  }
  results.push(judge(name, "B", occ, sPool, STOCK_MAIN, MIN_STOCK));
}
for (const [name, t] of Object.entries(stockTests)) results.push(judge(name, t.feeds, t.occ, sPool, STOCK_MAIN, MIN_STOCK));

// ── print ──
p("## Summary");
p();
p(`Market-wide tests: NIFTY 50 return, main span 3 months. Per-stock tests: the stock's return minus the NIFTY 50's, main span 1 month. ${mDates.length} sessions, ${mDates[0]} to ${mDates.at(-1)}.`);
p();
p("| Test | Feeds | Episodes | Months | Median, main span | Any day | Beats random | Same way | Verdict |");
p("|---|---|---|---|---|---|---|---|---|");
for (const r of results) {
  const luck = r.luck ? `${r.luck.strength.toFixed(1)}% (${r.luck.direction})` : "—";
  p(`| ${r.name} | ${r.feeds} | ${r.n} | ${r.months} | ${f(r.medians[r.main]!)}% | ${f(r.baseline[r.main]!)}% | ${luck} | ${r.same} of 4 | **${r.verdict}** |`);
}
p();
p(`Rules (fixed before results): Build = at least ${MIN_MARKET} (market) / ${MIN_STOCK} (per stock) episodes, beats 97.5% of 1,000 random draws in its direction at the main span, and on the same side of an ordinary day at 3 or more of the other 4 spans. Maybe = same side at 3 or more but not Build.`);
p();
p("## Every span");
p();
for (const r of results) {
  p(`**${r.name}**: ${r.n} episodes in ${r.months} distinct months.`);
  p();
  p(`| | ${LABELS.join(" | ")} |`);
  p(`|---|${LABELS.map(() => "---").join("|")}|`);
  p(`| Median after the signal | ${r.medians.map((v) => `${f(v)}%`).join(" | ")} |`);
  p(`| Any day | ${r.baseline.map((v) => `${f(v)}%`).join(" | ")} |`);
  p();
}
p("## By fifth (every day counted, so neighbouring days overlap)");
p();
p("| Fifth | 10-day up-volume share → NIFTY 50, 3 months | CMF(20) → excess return, 1 month |");
p("|---|---|---|");
for (let k = 0; k < 5; k++) {
  const mv = share10.map((s, i) => (s !== null && fifthOf(s, s10Cuts) === k ? mRet(i)[MARKET_MAIN] : null)).filter((v): v is number => v !== null);
  const sv = perStock.flatMap((s) => s.days.filter((d, i) => s.member[i] && d.cmf !== null && fifthOf(d.cmf, cmfCuts) === k).map((d) => d.ex[STOCK_MAIN]).filter((v): v is number => v !== null));
  p(`| ${["Bottom", "2nd", "Middle", "4th", "Top"][k]} | ${f(median(mv))}% (${mv.length} days) | ${f(median(sv))}% (${sv.length} days) |`);
}
p();
p(`Fifth cut points: 10-day up-volume share ${s10Cuts.map((c) => c.toFixed(1)).join(" / ")}%; CMF ${cmfCuts.map((c) => c.toFixed(3)).join(" / ")}.`);

console.log(out.join("\n"));
await sql.end();
```

- [ ] **Step 3: Typecheck and run it**

Run: `bunx tsc --noEmit && bun run research:volume > /private/tmp/claude-501/-Users-4bh1nav-personalProjects-tradeSence/5dd651f2-6af2-459c-803c-1ef0b1632fa5/scratchpad/0002.md && head -40 /private/tmp/claude-501/-Users-4bh1nav-personalProjects-tradeSence/5dd651f2-6af2-459c-803c-1ef0b1632fa5/scratchpad/0002.md`
Expected: a Summary table with 15 rows, each with a verdict; no exceptions. Sanity checks to do by eye (fix code, never the rules, if one fails): market "Any day" at 3 months ≈ +3.7% (the median the Signals page shows as "Any day" at 3 months); per-stock "Any day" excess return near 0%; panic days include March 2020.

- [ ] **Step 4: Run the full suite and commit**

Run: `bun test` → all PASS.

```bash
git add src/research/cli-volume.ts package.json
git commit -m "Research 0002: the runner (bun run research:volume)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: TradingView comparison

**Files:** none changed unless a mismatch is found.

- [ ] **Step 1: Our numbers** — run `bun run research:volume -- --check RELIANCE,INFY` and note CMF(20) and MFI(14) and their date.

- [ ] **Step 2: TradingView's numbers** — load the TradingView connector tools with ToolSearch (`mcp__claude_ai_Trading_view__mcp-tv-get-screener-columns`, `mcp-tv-run-screener`, `mcp-tv-get-ohlcv`). Find the columns for Chaikin Money Flow (20) and Money Flow Index (14) and fetch them for `NSE:RELIANCE` and `NSE:INFY`. If the columns aren't available, fetch the last 40 daily bars with `mcp-tv-get-ohlcv` and run our `cmf`/`mfi` on TradingView's own bars instead, which tests the formulas independent of our data.

- [ ] **Step 3: Compare** — agreement within 0.02 (CMF) and 2 points (MFI) counts as a match (TradingView's volume can differ slightly from NSE's bhavcopy). Record both sets of numbers for the write-up. A larger gap: investigate with superpowers:systematic-debugging; if the cause is a real difference (e.g. their volume source), write it up as `docs/decisions/0018-…` and keep going.

---

### Task 8: Write-up and docs

**Files:**
- Create: `docs/research/0002-does-volume-predict.md`
- Modify: `docs/decisions/README.md`, `TODO.md`, `README.md`, `CLAUDE.md`

- [ ] **Step 1: The write-up** — from the Task 6 output and Task 7 numbers, write `docs/research/0002-does-volume-predict.md` in research 0001's style and plain language (the owner is not a finance expert):
  - Header: `# 0002 — Does volume tell us anything on the NIFTY 50?`, date, `Re-run any time: bun run research:volume`.
  - **The question.**
  - **The short answer:** one table, with each test, what happened next in one plain phrase, the verdict, and which project it feeds (A market-wide, B Report Card, C Screener). Then a one-line summary.
  - **How to read the numbers:** each indicator explained with an everyday example (CMF: closing near the day's high on big volume; MFI: the "RSI with volume"; OBV: running tally; up-volume share and 90% days). Explain "beats random", "same way" and "distinct months".
  - **Results:** the summary table and the per-span tables from the output, with a short plain comment on anything that stands out.
  - **Caveats:** ~15 tests at once (about 1 could pass by luck); per-stock signals bunch in crashes (see months); one kind of market since 2020; price index only; daily data only; not investment advice.
  - **TradingView check:** the numbers from Task 7.
  - **What this means for A, B and C:** for each project, which indicators to build and which to drop, following the verdicts strictly.
  - **Method:** data, adjustments, membership, episodes, horizons, the verdict rules (copied from the spec).
  - **Appendix: full results (generated):** the complete runner output.

- [ ] **Step 2: Index and roadmap**
  - `docs/decisions/README.md`: add `| [Research 0002](../research/0002-does-volume-predict.md) | 2026-10-03 | *(study)* Does volume tell us anything on the NIFTY 50? | <one-line result> |` next to Research 0001's row, and add `[0002 — Does volume tell us anything?](../research/0002-does-volume-predict.md)` to the research list under the table.
  - `TODO.md`: add a "Volume (from research 0002)" section listing projects A, B, C with only the indicators the study supports (and a struck-through line for each dropped one with "research 0002 found no edge", as for "Overbought" in Signals). Update "Where we left off".
  - `README.md` → Function reference: a section for `src/indicators/history.ts` (`loadAdjustedHistory`, `loadRenames`) and `src/research/volume.ts` / `volume-data.ts` / `cli-volume.ts`, one line per exported function.
  - `CLAUDE.md` → Commands: add `bun run research:volume                        # volume indicators -> later returns study` after the forward-returns line.

- [ ] **Step 3: Verify and commit**

Run: `bun test && bunx tsc --noEmit` → all PASS.

```bash
git add docs/research/0002-does-volume-predict.md docs/decisions/README.md TODO.md README.md CLAUDE.md
git commit -m "Research 0002: does volume tell us anything on the NIFTY 50?

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
