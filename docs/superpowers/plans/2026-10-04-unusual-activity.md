# Unusual activity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A nightly-computed list of each session's unusual stock-days (four kinds), shown on a new `/activity` page (whole market or NIFTY 50) and as a card on NIFTY 50 Report Cards.

**Architecture:** The per-stock delivery maths moves from research into `src/indicators/activity.ts` (one copy for study and page). `unusualDays(h)` turns one company's `History` into its unusual rows; `computeUnusualDays()` runs it for every company and replaces the `unusual_days` table in one transaction, from `ingest:nightly`. `src/query/activity.ts` reads it for the page and the card.

**Tech Stack:** Bun, TypeScript, Next.js 16 (App Router, server components), drizzle + Postgres, Tailwind v4 tokens, `bun:test`.

**Spec:** `docs/superpowers/specs/2026-10-04-unusual-activity-design.md`

## Global Constraints

- Thresholds: Big keeping `kept_ratio ≥ 5`; Huge volume `volume_ratio ≥ 5`; Delivery jump `delivery_pct ≥ usual + 30`; Delivery collapse `delivery_pct ≤ usual − 30`.
- Normal = mean of the previous 20 sessions, same segment, ≥ 15 values (`windowMean(v, segs, 1)`).
- Share counts × `shareFactors`; delivery % unadjusted. Excluded days (decision 0021) carry no delivery figure.
- Watched: companies (ETFs out via `fund-symbols.txt`) with median 20-session turnover ≥ ₹1 crore (`1e7`).
- Per-company history only via `loadAdjustedHistory` (CLAUDE.md). Never write adjusted prices to `daily_prices`.
- Search params validated by strict comparisons; fall back to defaults (CLAUDE.md, `isMaKind`).
- UI: design-system tokens only (`text-up`, `bg-card`, `text-heading`, `px-card-x`, `py-cell`, `h-row-head`…), never raw hex or raw px for density-controlled sizes (`tests/density.test.ts`); no `<Term>` inside a `<Link>`; read `docs/design/system/README.md` before Task 6.
- Every new term on screen: a glossary entry + `<Term>` (`tests/glossary.test.ts`).
- Wording: facts, never "buy", "bullish", "smart money".
- Tests from repo root (`bun test …`, DB `tradesence_test`). `drizzle/` only via `bun run db:generate` (hook blocks edits).

## Review Focus

- A session where only NIFTY-50-switch is on and no member was unusual: an empty state, not a crash or a blank card.
- `kinds` param with an unknown value or all four removed: falls back to all four, never an empty filter or SQL built from the param.
- A stock renamed during its 20-session window: one row under today's symbol, not two half-histories.
- The nightly run and a page view at the same moment: the table is replaced in one transaction, so a reader sees the old or new set, never an empty table.
- A date before the first unusual day, or a weekend: snaps to the previous session with data and says so (like Screener).

---

## File Structure

- Create `src/indicators/activity.ts`: shared constants, `windowMean`, `liquidFlags`, thresholds, `unusualDays`, `unusualScore`.
- Create `src/indicators/universe.ts`: `companies(funds)` (moved from `src/research/delivery-data.ts`), `readFundSymbols` / `fundSymbols` (moved from `src/research/funds.ts`), `fund-symbols.txt` moves beside it.
- Create `src/indicators/compute-activity.ts`, `src/indicators/cli-activity.ts`.
- Modify `src/research/delivery.ts`, `delivery-data.ts`, `cli-delivery.ts`, `cli-fund-symbols.ts`; delete `src/research/funds.ts`.
- Modify `src/db/schema.ts` (+ generated migration), `src/ingest/cli-nightly.ts`, `package.json`.
- Create `src/query/activity.ts`; `tests/activity.test.ts`, `tests/activity-query.test.ts`.
- Modify `src/lib/glossary.ts`, `src/lib/format.ts`, `src/components/SiteNav.tsx`, `src/components/hotkey-target.ts`, `tests/hotkeys.test.ts`, `tests/format.test.ts`.
- Create `src/app/activity/page.tsx`, `src/components/ActivityTable.tsx`, `src/components/UnusualDaysCard.tsx`; modify `src/app/stock/[symbol]/page.tsx`.
- Docs: `docs/decisions/0023-unusual-activity.md`, `docs/decisions/README.md`, `docs/pipelines.md`, `README.md`, `CLAUDE.md`, `TODO.md`.

---

### Task 1: Shared maths and universe out of research

**Files:** Create `src/indicators/activity.ts`, `src/indicators/universe.ts`; move `src/research/fund-symbols.txt` → `src/indicators/fund-symbols.txt`; modify `src/research/delivery.ts`, `src/research/delivery-data.ts`, `src/research/cli-delivery.ts`, `src/research/cli-fund-symbols.ts`, `tests/delivery-research.test.ts`; delete `src/research/funds.ts`.

**Interfaces:**
- Produces (`src/indicators/activity.ts`): `WINDOW = 20`, `MIN_PRESENT = 15`, `MIN_TURNOVER = 1e7`, `EXCLUDED_DAYS: Set<string>`, `windowMean(v, segs, offset: 0|1)`, `liquidFlags(turnover: number[], segs: number[][]): boolean[]`.
- Produces (`src/indicators/universe.ts`): `companies(funds?: Set<string>): Promise<string[]>`, `fundSymbols(csv: string): string[]`, `readFundSymbols(file?): Set<string>`, `FUND_SYMBOLS_FILE`.
- `src/research/delivery.ts` re-exports the activity constants and `windowMean` so its tests stay unchanged.

- [ ] **Step 1: Failing test.** Append to `tests/delivery-research.test.ts`:

```ts
describe("shared with the Unusual activity page", () => {
  test("the study and the page use one copy of the maths", async () => {
    const a = await import("../src/indicators/activity");
    const r = await import("../src/research/delivery");
    expect(r.windowMean).toBe(a.windowMean);
    expect(r.EXCLUDED_DAYS).toBe(a.EXCLUDED_DAYS);
  });
  test("liquidFlags: median of the last 20 sessions' turnover ≥ ₹1 crore, within a segment", async () => {
    const { liquidFlags } = await import("../src/indicators/activity");
    const t = Array.from({ length: 25 }, (_, i) => (i < 12 ? 2e7 : 5e6));
    const f = liquidFlags(t, [t.map((_, i) => i)]);
    expect(f[18]).toBe(false); // fewer than 20 sessions
    expect(f[19]).toBe(true); // 12 of 20 at ₹2 cr: median ₹2 cr
    expect(f[24]).toBe(false); // 7 of 20 at ₹2 cr: median ₹50 lakh
  });
});
```

- [ ] **Step 2: Run** `bun test tests/delivery-research.test.ts` — Expected: FAIL (cannot find `../src/indicators/activity`).

- [ ] **Step 3: Implement.** Create `src/indicators/activity.ts` with the doc comment below, and MOVE (cut from `src/research/delivery.ts`, paste here unchanged) the constants `WINDOW`, `MIN_PRESENT`, `MIN_TURNOVER`, `EXCLUDED_DAYS` and the function `windowMean`. Add:

```ts
/**
 * Per-stock delivery and volume maths shared by research 0003 and the Unusual
 * activity page, so the study and the page can never disagree. Spec:
 * docs/superpowers/specs/2026-10-04-unusual-activity-design.md.
 */
import { segmentByGaps } from "./gaps";
import { median } from "./signals";

/** True where the median turnover of the last WINDOW sessions (same segment) is ≥ MIN_TURNOVER. */
export function liquidFlags(turnover: number[], segs: number[][]): boolean[] {
  const out: boolean[] = new Array(turnover.length).fill(false);
  for (const s of segs) {
    s.forEach((i, j) => {
      if (j < WINDOW - 1) return;
      out[i] = median(s.slice(j - WINDOW + 1, j + 1).map((k) => turnover[k]!))! >= MIN_TURNOVER;
    });
  }
  return out;
}
```

(`segmentByGaps` is imported for Task 2; remove the import if `tsc` flags it unused before then.) In `src/research/delivery.ts`: delete the moved definitions; add `import { EXCLUDED_DAYS, MIN_PRESENT, MIN_TURNOVER, WINDOW, liquidFlags, windowMean } from "../indicators/activity";` and `export { EXCLUDED_DAYS, MIN_PRESENT, MIN_TURNOVER, WINDOW, windowMean } from "../indicators/activity";`; replace the inline liquidity loop in `stockSeries` with `const liquid = liquidFlags(h.turnover, segs);`.

Create `src/indicators/universe.ts`: move `fundSymbols`, `readFundSymbols`, `FUND_SYMBOLS_FILE` (from `src/research/funds.ts`, unchanged; `FUND_SYMBOLS_FILE` still `new URL("./fund-symbols.txt", import.meta.url)`) and `companies` (from `src/research/delivery-data.ts`, unchanged, with its `db`/`sql` imports). `git mv src/research/fund-symbols.txt src/indicators/fund-symbols.txt`; `git rm src/research/funds.ts`. Update imports: `src/research/cli-delivery.ts` (`companies`, `readFundSymbols` from `../indicators/universe`), `src/research/cli-fund-symbols.ts` (`FUND_SYMBOLS_FILE`, `fundSymbols` from `../indicators/universe`), `tests/delivery-research.test.ts` (`companies` and `fundSymbols` from `../src/indicators/universe`). `delivery-data.ts` keeps only `tradingDays`.

- [ ] **Step 4: Run** `bun test tests/delivery-research.test.ts && bunx tsc --noEmit` — Expected: all PASS (36 + 2).

- [ ] **Step 5: Run the study unchanged** `bun run research:delivery | sed -n 1,14p` — Expected: identical to `docs/research/0003-does-delivery-predict.md`'s appendix (2,949 companies, same table). This proves the move changed nothing.

- [ ] **Step 6: Commit** `git add -A src/indicators src/research tests/delivery-research.test.ts && git commit -m "Move delivery maths and the company universe to src/indicators (shared with Unusual activity)"`

---

### Task 2: `unusualDays` — one company's unusual rows

**Files:** Modify `src/indicators/activity.ts`; create `tests/activity.test.ts`.

**Interfaces:**
- Consumes: `History` (`src/indicators/history.ts`), `segmentIds` (`src/indicators/signals.ts`).
- Produces: `KEPT_X = 5`, `VOLUME_X = 5`, `JUMP_PTS = 30`; `type Kind = "kept" | "volume" | "jump" | "collapse"`; `KINDS: readonly Kind[]`;
  `type UnusualRow = { tradeDate: string; kept: boolean; volume: boolean; jump: boolean; collapse: boolean; keptRatio: number | null; volumeRatio: number | null; deliveryPct: number | null; usualDeliveryPct: number | null; changePct: number | null; turnover: number }`;
  `unusualDays(h: History): UnusualRow[]` (only liquid days with ≥ 1 kind);
  `unusualScore(r: Pick<UnusualRow, "keptRatio" | "volumeRatio" | "deliveryPct" | "usualDeliveryPct">): number`.

- [ ] **Step 1: Failing tests** — `tests/activity.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import type { History } from "../src/indicators/history";
import { unusualDays, unusualScore, KEPT_X, JUMP_PTS } from "../src/indicators/activity";

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
    turnover: fill(2e7), factors: fill(1), shareFactors: fill(1), traded: fill(1000), delivered: fill(400),
    ...over,
  } as History;
}
const at = (h: History, i: number, patch: Partial<Record<"volume" | "traded" | "delivered" | "close", number>>) => {
  for (const [k, v] of Object.entries(patch)) (h[k as keyof History] as number[])[i] = v!;
  return h;
};
const day = (h: History, i: number) => unusualDays(h).find((r) => r.tradeDate === h.dates[i]);

describe("unusualDays", () => {
  test("an ordinary history has no unusual days", () => {
    expect(unusualDays(hist(40))).toEqual([]);
  });

  test("Big keeping fires at exactly 5× delivered shares, not just below", () => {
    const h = at(hist(40), 30, { delivered: 2000, traded: 2500, volume: 2500 }); // 2000 = 5 × 400
    expect(day(h, 30)?.kept).toBe(true);
    expect(day(h, 30)?.keptRatio).toBeCloseTo(KEPT_X, 9);
    const h2 = at(hist(40), 30, { delivered: 1999, traded: 2500, volume: 2500 });
    expect(day(h2, 30)?.kept ?? false).toBe(false);
  });

  test("Huge volume fires at 5× traded shares", () => {
    const h = at(hist(40), 30, { volume: 5000, traded: 5000, delivered: 2000 });
    expect(day(h, 30)?.volume).toBe(true);
    expect(day(h, 30)?.volumeRatio).toBeCloseTo(5, 9);
  });

  test("Delivery jump at +30 points; collapse at −30 points", () => {
    const up = at(hist(40), 30, { delivered: 700 }); // 70% vs usual 40%
    expect(day(up, 30)?.jump).toBe(true);
    expect(day(up, 30)?.deliveryPct! - day(up, 30)?.usualDeliveryPct!).toBeCloseTo(JUMP_PTS, 9);
    const down = at(hist(40), 30, { delivered: 100 }); // 10% vs 40%
    expect(day(down, 30)?.collapse).toBe(true);
  });

  test("a 1:2 split inside the window fires nothing", () => {
    const n = 40;
    const split = (i: number) => i >= 25;
    const h = hist(n, {
      volume: Array.from({ length: n }, (_, i) => (split(i) ? 2000 : 1000)),
      traded: Array.from({ length: n }, (_, i) => (split(i) ? 2000 : 1000)),
      delivered: Array.from({ length: n }, (_, i) => (split(i) ? 800 : 400)),
      close: Array.from({ length: n }, (_, i) => (split(i) ? 50 : 100)),
      factors: Array.from({ length: n }, (_, i) => (split(i) ? 1 : 2)),
      shareFactors: Array.from({ length: n }, (_, i) => (split(i) ? 1 : 2)),
    });
    expect(unusualDays(h)).toEqual([]);
  });

  test("fewer than 15 earlier sessions: never fires", () => {
    const h = at(hist(30), 14, { delivered: 4000, traded: 9000, volume: 9000 });
    expect(day(h, 14)).toBeUndefined();
  });

  test("on an excluded day only Huge volume can fire", () => {
    const h = at(hist(40), 30, { delivered: 4000, traded: 9000, volume: 9000 });
    h.dates[30] = "2019-06-17";
    const r = day(h, 30)!;
    expect([r.kept, r.volume, r.jump, r.collapse]).toEqual([false, true, false, false]);
    expect(r.deliveryPct).toBeNull();
  });

  test("an illiquid stock never fires", () => {
    const h = at(hist(40, { turnover: Array.from({ length: 40 }, () => 5e6) }), 30, { delivered: 4000, traded: 9000, volume: 9000 });
    expect(unusualDays(h)).toEqual([]);
  });

  test("the day's move is on the adjusted close", () => {
    const h = at(hist(40), 30, { volume: 9000, traded: 9000, delivered: 3600, close: 110 });
    expect(day(h, 30)?.changePct).toBeCloseTo(10, 9);
  });
});

describe("unusualScore", () => {
  test("the largest ratio to its own threshold", () => {
    expect(unusualScore({ keptRatio: 10, volumeRatio: 6, deliveryPct: 50, usualDeliveryPct: 40 })).toBeCloseTo(2, 9);
    expect(unusualScore({ keptRatio: null, volumeRatio: 5, deliveryPct: 10, usualDeliveryPct: 100 })).toBeCloseTo(3, 9);
    expect(unusualScore({ keptRatio: null, volumeRatio: null, deliveryPct: null, usualDeliveryPct: null })).toBe(0);
  });
});
```

- [ ] **Step 2: Run** `bun test tests/activity.test.ts` — Expected: FAIL (`unusualDays` not exported).

- [ ] **Step 3: Implement** (append to `src/indicators/activity.ts`; add imports `import type { History } from "./history";` and `segmentIds` to the `./signals` import):

```ts
export const KEPT_X = 5; // delivered shares vs normal
export const VOLUME_X = 5; // traded shares vs normal
export const JUMP_PTS = 30; // delivery % vs normal, either way

export type Kind = "kept" | "volume" | "jump" | "collapse";
export const KINDS: readonly Kind[] = ["kept", "volume", "jump", "collapse"];

export type UnusualRow = {
  tradeDate: string;
  kept: boolean;
  volume: boolean;
  jump: boolean;
  collapse: boolean;
  keptRatio: number | null; // adjusted delivered shares ÷ previous-20-session mean
  volumeRatio: number | null; // adjusted traded shares ÷ previous-20-session mean
  deliveryPct: number | null;
  usualDeliveryPct: number | null;
  changePct: number | null; // adjusted close vs previous session, %
  turnover: number; // ₹ traded that day
};

const ratio = (x: number | null, m: number | null) => (x === null || m === null || m === 0 ? null : x / m);

/** One company's unusual sessions: liquid days where at least one kind fires (spec thresholds). */
export function unusualDays(h: History): UnusualRow[] {
  const segs = segmentByGaps(h.dates);
  const seg = segmentIds(h.dates);
  const has = (i: number) => !EXCLUDED_DAYS.has(h.dates[i]!) && h.traded[i] != null && h.delivered[i] != null && h.traded[i]! > 0;
  // × 100 before ÷, so whole-number shares give exact percentages: (700/1000)*100 can land a
  // hair under 70, and a stock at exactly +30 points must count.
  const dp = h.dates.map((_, i) => (has(i) ? (h.delivered[i]! * 100) / h.traded[i]! : null));
  const delivered = h.dates.map((_, i) => (has(i) ? h.delivered[i]! * h.shareFactors[i]! : null));
  const volume = h.volume.map((v, i) => v * h.shareFactors[i]!);
  const usual = windowMean(dp, segs, 1);
  const delMean = windowMean(delivered, segs, 1);
  const volMean = windowMean(volume, segs, 1);
  const liquid = liquidFlags(h.turnover, segs);
  const close = h.close.map((c, i) => c / h.factors[i]!);

  const out: UnusualRow[] = [];
  h.dates.forEach((d, i) => {
    if (!liquid[i]) return;
    const keptRatio = ratio(delivered[i]!, delMean[i]!);
    const volumeRatio = ratio(volume[i]!, volMean[i]!);
    const p = dp[i]!;
    const u = usual[i]!;
    const row: UnusualRow = {
      tradeDate: d,
      kept: keptRatio !== null && keptRatio >= KEPT_X,
      volume: volumeRatio !== null && volumeRatio >= VOLUME_X,
      jump: p !== null && u !== null && p - u >= JUMP_PTS,
      collapse: p !== null && u !== null && u - p >= JUMP_PTS,
      keptRatio, volumeRatio, deliveryPct: p, usualDeliveryPct: u,
      changePct: i > 0 && seg[i] === seg[i - 1] ? (close[i]! / close[i - 1]! - 1) * 100 : null,
      turnover: h.turnover[i]!,
    };
    if (row.kept || row.volume || row.jump || row.collapse) out.push(row);
  });
  return out;
}

/** How unusual, for sorting: the largest of each measure ÷ its threshold. */
export function unusualScore(r: Pick<UnusualRow, "keptRatio" | "volumeRatio" | "deliveryPct" | "usualDeliveryPct">): number {
  const parts = [(r.keptRatio ?? 0) / KEPT_X, (r.volumeRatio ?? 0) / VOLUME_X];
  if (r.deliveryPct !== null && r.usualDeliveryPct !== null) parts.push(Math.abs(r.deliveryPct - r.usualDeliveryPct) / JUMP_PTS);
  return Math.max(0, ...parts);
}
```

Note on `delivered[i]!` / `dp[i]!` above: these arrays hold `number | null`; the `!` only silences the index-access check (`noUncheckedIndexedAccess`), nulls are handled by `ratio` and the `p !== null` checks.

- [ ] **Step 4: Run** `bun test tests/activity.test.ts && bunx tsc --noEmit` — Expected: PASS.

- [ ] **Step 5: Commit** `git add src/indicators/activity.ts tests/activity.test.ts && git commit -m "unusualDays: the four kinds of unusual day for one company"`

---

### Task 3: Table, nightly computation, backfill

**Files:** Modify `src/db/schema.ts`; generated `drizzle/0009_*.sql`; create `src/indicators/compute-activity.ts`, `src/indicators/cli-activity.ts`; modify `src/ingest/cli-nightly.ts`, `package.json`, `tests/activity.test.ts`.

**Interfaces:**
- Produces: `schema.unusualDays` table; `computeUnusualDays(opts?: { symbols?: string[] }): Promise<{ rows: number; companies: number }>`.

- [ ] **Step 1: Add the table** to `src/db/schema.ts` (after `dailyDelivery`):

```ts
/**
 * Each session's unusual stock-days (Unusual activity page): only days where at
 * least one of the four kinds fired, for liquid companies (ETFs out). Rebuilt in
 * full each night from daily_prices + daily_delivery by computeUnusualDays, so a
 * late corporate action re-adjusts history. `symbol` is today's symbol (history
 * joined across renames). Spec: docs/superpowers/specs/2026-10-04-unusual-activity-design.md.
 */
export const unusualDays = pgTable(
  "unusual_days",
  {
    tradeDate: date("trade_date").notNull(),
    symbol: text("symbol").notNull(),
    kept: boolean("kept").notNull(),
    volume: boolean("volume").notNull(),
    jump: boolean("jump").notNull(),
    collapse: boolean("collapse").notNull(),
    keptRatio: doublePrecision("kept_ratio"),
    volumeRatio: doublePrecision("volume_ratio"),
    deliveryPct: doublePrecision("delivery_pct"),
    usualDeliveryPct: doublePrecision("usual_delivery_pct"),
    changePct: doublePrecision("change_pct"),
    turnover: doublePrecision("turnover").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tradeDate, t.symbol] }),
    index("unusual_days_symbol_date_idx").on(t.symbol, t.tradeDate),
  ],
);
```

Add `boolean` to the `drizzle-orm/pg-core` import. Run `bun run db:generate && bun run db:migrate`, and migrate the test DB: `DATABASE_URL=$(sed -n 's/^DATABASE_URL=//p' .env | sed 's|/tradesence$|/tradesence_test|') bunx drizzle-kit migrate`.

- [ ] **Step 2: Failing DB test** (append to `tests/activity.test.ts`; add imports `import { beforeEach } from "bun:test"` merged into the first import, `import { db, schema } from "../src/db";`, `import { computeUnusualDays } from "../src/indicators/compute-activity";`):

```ts
describe("computeUnusualDays", () => {
  beforeEach(async () => {
    for (const t of [schema.dailyPrices, schema.dailyDelivery, schema.corporateActions, schema.symbolChanges, schema.unusualDays]) await db.delete(t);
  });

  test("writes only the unusual days, and a re-run replaces rather than duplicates", async () => {
    const days = hist(40).dates;
    await db.insert(schema.dailyPrices).values(days.map((d, i) => ({
      tradeDate: d, symbol: "ABC", series: "EQ", open: 100, high: 101, low: 99, close: 100, prevClose: 100,
      volume: i === 30 ? 9000 : 1000, turnover: 2e7,
    })));
    await db.insert(schema.dailyDelivery).values(days.map((d, i) => ({
      tradeDate: d, symbol: "ABC", series: "EQ", tradedQty: i === 30 ? 9000 : 1000, deliverableQty: i === 30 ? 3600 : 400,
    })));
    await computeUnusualDays({ symbols: ["ABC"] });
    await computeUnusualDays({ symbols: ["ABC"] });
    const rows = await db.select().from(schema.unusualDays);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tradeDate: days[30], symbol: "ABC", volume: true, kept: true });
  });
});
```

- [ ] **Step 3: Run** `bun test tests/activity.test.ts` — Expected: FAIL (cannot find `compute-activity`).

- [ ] **Step 4: Implement** `src/indicators/compute-activity.ts`:

```ts
/**
 * Rebuilds `unusual_days` for every company (Unusual activity page). Full
 * recompute in one transaction: a reader sees the old set or the new one,
 * never an empty table, and a late corporate action re-adjusts history.
 */
import { db, schema } from "../db";
import { loadAdjustedHistory, loadRenames } from "./history";
import { unusualDays } from "./activity";
import { companies, readFundSymbols } from "./universe";

const CHUNK = 1000; // 13 columns × 1000 rows, under Postgres' 65535 bind parameters

export async function computeUnusualDays(opts: { symbols?: string[] } = {}): Promise<{ rows: number; companies: number }> {
  const renames = await loadRenames();
  const symbols = opts.symbols ?? (await companies(readFundSymbols()));
  const rows: (typeof schema.unusualDays.$inferInsert)[] = [];
  let used = 0;
  for (const symbol of symbols) {
    const h = await loadAdjustedHistory(symbol, renames);
    if (!h || !h.delivered.some((x) => x != null)) continue;
    used++;
    for (const r of unusualDays(h)) rows.push({ symbol, ...r });
  }
  await db.transaction(async (tx) => {
    await tx.delete(schema.unusualDays);
    for (let i = 0; i < rows.length; i += CHUNK) await tx.insert(schema.unusualDays).values(rows.slice(i, i + CHUNK));
  });
  return { rows: rows.length, companies: used };
}
```

Note: `opts.symbols` is the test seam; with it, the delete still clears the whole table, which is what the test wants and what the nightly never uses.

`src/indicators/cli-activity.ts`:

```ts
/** Rebuilds the Unusual activity table. bun run activity */
import { sql } from "../db";
import { computeUnusualDays } from "./compute-activity";

const t0 = Date.now();
const r = await computeUnusualDays();
console.log(`[activity] ${r.rows} unusual stock-days from ${r.companies} companies in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
await sql.end();
```

`package.json` scripts, after `"indicators"`: `"activity": "bun run src/indicators/cli-activity.ts",`

In `src/ingest/cli-nightly.ts`, after the `computeIndicators` line `console.log(\`[nightly] indicators: ${rows} rows\`);` add:

```ts
// Unusual activity page: rebuilt in full after delivery and the averages (spec 2026-10-04).
try {
  const act = await computeUnusualDays();
  console.log(`[nightly] unusual activity: ${act.rows} stock-days from ${act.companies} companies`);
} catch (e) {
  console.warn(`[nightly] WARNING unusual activity not rebuilt: ${e instanceof Error ? e.message : e}`);
}
```

and the import `import { computeUnusualDays } from "../indicators/compute-activity";`.

- [ ] **Step 5: Run** `bun test tests/activity.test.ts && bunx tsc --noEmit` — Expected: PASS.

- [ ] **Step 6: Backfill and measure.** Run `time bun run activity`. Expected: under ~2–3 minutes; rows ≈ 75/day × ~2,450 sessions. Then via the postgres MCP:

```sql
select count(*)::numeric / count(distinct trade_date) as per_day,
       avg(kept::int) * 100 as kept_pct, avg(volume::int) * 100 as volume_pct,
       avg(jump::int) * 100 as jump_pct, avg(collapse::int) * 100 as collapse_pct
from unusual_days where trade_date >= '2025-10-01';
```

Record the per-day count and each kind's per-day count (multiply the share by per_day) for decision 0023. Spot-check one row by hand: a stock with `kept` on a recent day — compare its delivered shares in `daily_delivery` against the mean of its previous 20.

- [ ] **Step 7: Commit** `git add src/db/schema.ts drizzle src/indicators/compute-activity.ts src/indicators/cli-activity.ts src/ingest/cli-nightly.ts package.json tests/activity.test.ts && git commit -m "unusual_days table, nightly rebuild, bun run activity"`

---

### Task 4: Queries for the page and the card

**Files:** Create `src/query/activity.ts`, `tests/activity-query.test.ts`.

**Interfaces:**
- Consumes: `schema.unusualDays`, `unusualScore`, `Kind`.
- Produces:
  - `type ActivitySet = "all" | "nifty50"`
  - `type ActivityRow = UnusualRow & { symbol: string; member: boolean; score: number }` (from `../indicators/activity`)
  - `activitySession(dateIso?: string): Promise<string | null>` — latest session with rows, ≤ date when given
  - `activityNeighbours(dateIso: string): Promise<{ prev: string | null; next: string | null }>`
  - `activityFirst(): Promise<string | null>`
  - `activityOn(dateIso: string, set: ActivitySet): Promise<ActivityRow[]>` — sorted by `score` desc, then symbol
  - `kindCounts(rows: ActivityRow[]): Record<Kind, number>`
  - `filterKinds(rows: ActivityRow[], kinds: readonly Kind[]): ActivityRow[]`
  - `recentUnusual(symbol: string, toDate: string, days?: number): Promise<ActivityRow[]>` — newest first, last `days` (default 92) calendar days

- [ ] **Step 1: Failing tests** — `tests/activity-query.test.ts`:

```ts
import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { activitySession, activityNeighbours, activityOn, filterKinds, kindCounts, recentUnusual } from "../src/query/activity";

const row = (tradeDate: string, symbol: string, p: Partial<typeof schema.unusualDays.$inferInsert> = {}) => ({
  tradeDate, symbol, kept: false, volume: true, jump: false, collapse: false,
  keptRatio: 1, volumeRatio: 6, deliveryPct: 40, usualDeliveryPct: 40, changePct: 1, turnover: 2e7, ...p,
});

beforeEach(async () => {
  for (const t of [schema.unusualDays, schema.indexMembers]) await db.delete(t);
  await db.insert(schema.unusualDays).values([
    row("2026-09-29", "AAA", { volumeRatio: 10 }),
    row("2026-09-29", "BBB", { kept: true, keptRatio: 20, volume: false, volumeRatio: 2 }),
    row("2026-09-30", "AAA"),
    row("2026-10-01", "CCC", { jump: true, deliveryPct: 90, usualDeliveryPct: 40, volume: false, volumeRatio: 1 }),
  ]);
  await db.insert(schema.indexMembers).values([
    { indexName: "NIFTY50", symbol: "AAA", addedOn: "2020-01-01", removedOn: "2026-09-30" },
  ]);
});

describe("sessions", () => {
  test("latest session, or the last one on or before a date", async () => {
    expect(await activitySession()).toBe("2026-10-01");
    expect(await activitySession("2026-09-30")).toBe("2026-09-30");
    expect(await activitySession("2026-09-28")).toBeNull();
  });
  test("neighbours", async () => {
    expect(await activityNeighbours("2026-09-30")).toEqual({ prev: "2026-09-29", next: "2026-10-01" });
  });
});

describe("activityOn", () => {
  test("sorted by how unusual: BBB (20× kept = 4) before AAA (10× volume = 2)", async () => {
    expect((await activityOn("2026-09-29", "all")).map((r) => r.symbol)).toEqual(["BBB", "AAA"]);
  });
  test("NIFTY 50 switch uses membership on that date", async () => {
    expect((await activityOn("2026-09-29", "nifty50")).map((r) => r.symbol)).toEqual(["AAA"]);
    expect(await activityOn("2026-09-30", "nifty50")).toEqual([]); // AAA left on 2026-09-30
    expect((await activityOn("2026-09-29", "all")).find((r) => r.symbol === "AAA")?.member).toBe(true);
  });
  test("kind counts and filter", async () => {
    const rows = await activityOn("2026-09-29", "all");
    expect(kindCounts(rows)).toEqual({ kept: 1, volume: 1, jump: 0, collapse: 0 });
    expect(filterKinds(rows, ["kept"]).map((r) => r.symbol)).toEqual(["BBB"]);
  });
});

describe("recentUnusual", () => {
  test("a stock's unusual days in the last 92 days up to a date, newest first", async () => {
    expect((await recentUnusual("AAA", "2026-10-01")).map((r) => r.tradeDate)).toEqual(["2026-09-30", "2026-09-29"]);
    expect(await recentUnusual("AAA", "2026-09-28")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** `bun test tests/activity-query.test.ts` — Expected: FAIL (cannot find `../src/query/activity`).

- [ ] **Step 3: Implement** `src/query/activity.ts`:

```ts
/**
 * The Unusual activity page and the Report Card's "Unusual days" card read
 * unusual_days (rebuilt nightly). Spec: docs/superpowers/specs/2026-10-04-unusual-activity-design.md.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { KINDS, unusualScore, type Kind, type UnusualRow } from "../indicators/activity";
import { INDEX_NAME } from "../ingest/nifty50";

export type ActivitySet = "all" | "nifty50";
export type ActivityRow = UnusualRow & { symbol: string; member: boolean; score: number };

type Raw = {
  trade_date: string; symbol: string; kept: boolean; volume: boolean; jump: boolean; collapse: boolean;
  kept_ratio: number | null; volume_ratio: number | null; delivery_pct: number | null; usual_delivery_pct: number | null;
  change_pct: number | null; turnover: number; member: boolean;
};
const num = (v: number | null) => (v === null ? null : Number(v));
function toRow(r: Raw): ActivityRow {
  const base = {
    tradeDate: r.trade_date, symbol: r.symbol, kept: r.kept, volume: r.volume, jump: r.jump, collapse: r.collapse,
    keptRatio: num(r.kept_ratio), volumeRatio: num(r.volume_ratio), deliveryPct: num(r.delivery_pct),
    usualDeliveryPct: num(r.usual_delivery_pct), changePct: num(r.change_pct), turnover: Number(r.turnover), member: r.member,
  };
  return { ...base, score: unusualScore(base) };
}

const select = sql`
  select u.trade_date::text, u.symbol, u.kept, u.volume, u.jump, u.collapse, u.kept_ratio, u.volume_ratio,
         u.delivery_pct, u.usual_delivery_pct, u.change_pct, u.turnover,
         exists (select 1 from index_members m where m.index_name = ${INDEX_NAME} and m.symbol = u.symbol
                 and u.trade_date >= m.added_on and (m.removed_on is null or u.trade_date < m.removed_on)) as member
  from unusual_days u`;

export async function activitySession(dateIso?: string): Promise<string | null> {
  const r = await db.execute<{ d: string | null }>(sql`
    select max(trade_date)::text as d from unusual_days ${dateIso ? sql`where trade_date <= ${dateIso}` : sql``}`);
  return r[0]?.d ?? null;
}

export async function activityNeighbours(dateIso: string): Promise<{ prev: string | null; next: string | null }> {
  const r = await db.execute<{ prev: string | null; next: string | null }>(sql`
    select (select max(trade_date)::text from unusual_days where trade_date < ${dateIso}) as prev,
           (select min(trade_date)::text from unusual_days where trade_date > ${dateIso}) as next`);
  return { prev: r[0]?.prev ?? null, next: r[0]?.next ?? null };
}

export async function activityFirst(): Promise<string | null> {
  const r = await db.execute<{ d: string | null }>(sql`select min(trade_date)::text as d from unusual_days`);
  return r[0]?.d ?? null;
}

export async function activityOn(dateIso: string, set: ActivitySet): Promise<ActivityRow[]> {
  const rows = (await db.execute<Raw>(sql`${select} where u.trade_date = ${dateIso}`)).map(toRow);
  return rows
    .filter((r) => set === "all" || r.member)
    .sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
}

export function kindCounts(rows: ActivityRow[]): Record<Kind, number> {
  return Object.fromEntries(KINDS.map((k) => [k, rows.filter((r) => r[k]).length])) as Record<Kind, number>;
}

export function filterKinds(rows: ActivityRow[], kinds: readonly Kind[]): ActivityRow[] {
  return rows.filter((r) => kinds.some((k) => r[k]));
}

export async function recentUnusual(symbol: string, toDate: string, days = 92): Promise<ActivityRow[]> {
  return (await db.execute<Raw>(sql`${select}
    where u.symbol = ${symbol} and u.trade_date <= ${toDate} and u.trade_date > ${toDate}::date - ${days}::int
    order by u.trade_date desc`)).map(toRow);
}
```

- [ ] **Step 4: Run** `bun test tests/activity-query.test.ts && bunx tsc --noEmit` — Expected: PASS.

- [ ] **Step 5: Commit** `git add src/query/activity.ts tests/activity-query.test.ts && git commit -m "Unusual activity queries: sessions, day list, NIFTY 50 switch, a stock's recent days"`

---

### Task 5: Glossary, navigation, shortcut, ₹ crore format

**Files:** Modify `src/lib/glossary.ts`, `src/lib/format.ts`, `src/components/SiteNav.tsx`, `src/components/hotkey-target.ts`; tests `tests/hotkeys.test.ts`, `tests/format.test.ts`, `tests/glossary.test.ts`.

**Interfaces:** Produces glossary ids `"unusual-activity" | "big-keeping" | "huge-volume" | "delivery-pct" | "delivery-jump" | "delivery-collapse"`; `Section` gains `"activity"`; key `u` → `/activity?ma=…`; `formatCrore(n: number): string`.

- [ ] **Step 1: Failing tests.**
  - `tests/hotkeys.test.ts`, add: `test("u opens Unusual activity", () => { expect(hotkeyTarget("u", { page: "screener", ma: "sma200" })).toBe("/activity?ma=sma200"); });` (import `hotkeyTarget` is already there; if not, `import { hotkeyTarget } from "../src/components/hotkey-target";`).
  - `tests/format.test.ts`, add: `test("formatCrore", () => { expect(formatCrore(2e7)).toBe("₹2.0 cr"); expect(formatCrore(1.234e10)).toBe("₹1,234 cr"); expect(formatCrore(5e6)).toBe("₹0.5 cr"); });` (add `formatCrore` to its import).
  - `tests/glossary.test.ts` "covers the terms on screen": add `for (const id of ["unusual-activity", "big-keeping", "huge-volume", "delivery-pct", "delivery-jump", "delivery-collapse"]) expect(isTermId(id)).toBe(true);`

- [ ] **Step 2: Run** `bun test tests/hotkeys.test.ts tests/format.test.ts tests/glossary.test.ts` — Expected: 3 FAIL.

- [ ] **Step 3: Implement.**
  - `src/lib/format.ts`:

```ts
/** ₹ in crore: one decimal under ₹100 cr, none above. 2e7 → "₹2.0 cr". */
export function formatCrore(n: number): string {
  const cr = n / 1e7;
  return `₹${cr >= 100 ? Math.round(cr).toLocaleString("en-IN") : cr.toFixed(1)} cr`;
}
```

  - `src/components/hotkey-target.ts`: add `activity: "/activity",` to `BASE`; add `if (key === "u") return \`/activity?ma=${c.ma}\`;` after the `s` line; in the 1–3 branch return null also for `c.page === "activity"` (no average to switch).
  - `src/components/SiteNav.tsx`: `Section` gains `"activity"`; in the Stocks group, between screener and stock, add `{ key: "activity", href: "/activity", label: "Unusual activity", short: "Activity", hint: "u", icon: Zap },` (import `Zap` from `lucide-react`); `SHORTCUTS` row becomes `["b a c s u r g l", "Switch page"]`. Fix any `href` building in SiteNav that appends `?ma=` the same way as for screener (follow the screener link's pattern exactly).
  - `src/lib/glossary.ts`: add the six ids to `IDS` (after `"near-the-line"`), and entries (topic `"Stocks"`; `short` ≤ 220 chars; true minus `−` before digits; facts, no advice):

```ts
  "unusual-activity": {
    id: "unusual-activity", term: "Unusual activity", topic: "Stocks",
    short: "A session where a stock traded or was bought-and-kept far beyond its own normal, or where the share kept swung far from usual. A fact about the day, not a prediction.",
    read: "Use it to notice where something happened, then look for the reason (news, results, a block deal). It doesn't say whether the price will rise or fall.",
    what: "Each stock is compared with its own last 20 sessions, so a busy stock and a quiet one are judged by their own standards. Four kinds are tracked: big keeping, huge volume, delivery jump and delivery collapse.",
    calc: { plain: "Big keeping or huge volume: 5× or more the stock's 20-session average. Delivery jump or collapse: delivery % 30 points or more above or below its 20-session average. Only stocks trading ₹1 crore a day or more; ETFs left out." },
    example: "On a quiet day a stock usually sees 2 lakh shares kept; 12 lakh kept is 6× normal: big keeping.",
    mistakes: ["Reading it as a buy signal. Our research (study 0003) found big delivery days don't reliably lead to gains; an up-day delivery spike was followed by slightly worse returns."],
    related: ["big-keeping", "huge-volume", "delivery-jump", "delivery-collapse", "delivery-pct"],
    seeIt: { label: "Unusual activity", href: "/activity" },
  },
  "big-keeping": {
    id: "big-keeping", term: "Big keeping", topic: "Stocks",
    short: "Shares bought and kept (delivered) were at least 5× the stock's average over the previous 20 sessions.",
    read: "Far more shares than usual went home with buyers rather than being traded back the same day.",
    what: "Delivered shares are the part of the day's volume that changed owner for real. A jump means unusual buying-and-holding, whoever did it and for whatever reason.",
    calc: { plain: "Delivered shares today ÷ the average of the 20 sessions before it, adjusted for splits and bonuses." },
    example: "10 lakh shares delivered against an average of 1.6 lakh is 6.3×.",
    mistakes: ["Assuming it means the price will rise. It records what happened, not what comes next."],
    related: ["delivery-pct", "huge-volume", "unusual-activity"],
  },
  "huge-volume": {
    id: "huge-volume", term: "Huge volume", topic: "Stocks",
    short: "Shares traded were at least 5× the stock's average over the previous 20 sessions, whether kept or traded back the same day.",
    read: "Many more people than usual bought and sold. Check the price move and delivery % to see what kind of day it was.",
    what: "Volume counts every share that changed hands. A sudden surge often comes with news, results or a large block of shares changing owner.",
    calc: { plain: "Traded shares today ÷ the average of the 20 sessions before it, adjusted for splits and bonuses." },
    example: "45 lakh shares traded against an average of 6 lakh is 7.5×.",
    mistakes: ["Forgetting splits: after a 1:5 split share counts jump 5× with nothing happening. tradeSence adjusts for it."],
    related: ["volume-ratio", "big-keeping", "unusual-activity"],
  },
  "delivery-pct": {
    id: "delivery-pct", term: "Delivery %", topic: "Stocks",
    short: "Of the shares traded in a session, the percentage that buyers kept (took delivery of) rather than selling again the same day.",
    read: "High means buyers mostly held on; low means mostly same-day trading. What counts as high depends on the stock, so compare with its own usual.",
    what: "NSE publishes, for every stock each evening, how many traded shares were actually delivered. tradeSence divides delivered by traded.",
    calc: { plain: "Delivered shares ÷ traded shares × 100, from NSE's daily delivery file." },
    example: "1.5 crore INFY shares traded and 79 lakh delivered: 51.96%.",
    mistakes: ["Comparing across stocks. A steady large company may always run at 60% and a heavily traded one at 20%; both can be normal."],
    related: ["delivery-jump", "delivery-collapse", "big-keeping"],
  },
  "delivery-jump": {
    id: "delivery-jump", term: "Delivery jump", topic: "Stocks",
    short: "Delivery % was 30 points or more above the stock's average of the previous 20 sessions (for example 40% usually, 75% today).",
    read: "Buyers kept a much bigger share of what traded than usual, even if total volume was ordinary.",
    what: "It looks at the mix of the day's trading rather than its size: an unusually large part of it was buying-to-hold.",
    calc: { plain: "Delivery % today minus its average over the 20 sessions before it ≥ 30 points." },
    example: "Usually 38% delivered, today 74%: a jump of 36 points.",
    mistakes: ["Treating it as a buy signal; it describes the day's trading only."],
    related: ["delivery-pct", "delivery-collapse", "unusual-activity"],
  },
  "delivery-collapse": {
    id: "delivery-collapse", term: "Delivery collapse", topic: "Stocks",
    short: "Delivery % was 30 points or more below the stock's average of the previous 20 sessions: mostly same-day trading, far more than usual.",
    read: "Much of the day's trading was bought and sold within the session, often a burst of speculation.",
    what: "The opposite of a delivery jump: an unusually small part of the day's trading ended with someone holding the shares.",
    calc: { plain: "Its average over the 20 sessions before today minus today's delivery % ≥ 30 points." },
    example: "Usually 55% delivered, today 18%: down 37 points.",
    mistakes: ["Assuming the price will fall. It says who traded, not what happens next."],
    related: ["delivery-pct", "delivery-jump", "unusual-activity"],
  },
```

- [ ] **Step 4: Run** `bun test tests/hotkeys.test.ts tests/format.test.ts tests/glossary.test.ts tests/glossary-live.test.ts && bunx tsc --noEmit` — Expected: PASS. (If `glossary-live` needs a "today" line per term, return `null` for the six new ids there: no live sentence.)

- [ ] **Step 5: Commit** `git add src/lib src/components/SiteNav.tsx src/components/hotkey-target.ts tests && git commit -m "Unusual activity: glossary, sidebar entry, u shortcut, crore format"`

---

### Task 6: The page and the Report Card card

**Files:** Create `src/app/activity/page.tsx`, `src/components/ActivityTable.tsx`, `src/components/UnusualDaysCard.tsx`; modify `src/app/stock/[symbol]/page.tsx`. Read `docs/design/system/README.md` first and follow it.

**Interfaces:** Consumes Task 4 queries, Task 5 glossary ids and `formatCrore`, existing `AppShell`, `PageHeader`, `DateNav`, `Hotkeys`, `Card`, `Badge`, `Table*`, `SlidingPill`, `Term`, `formatDate`, `signed`, `cn`.

- [ ] **Step 1: `src/components/ActivityTable.tsx`** (server component; no client state):

```tsx
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCrore, signed } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ActivityRow } from "@/query/activity";
import { KINDS, type Kind } from "@/indicators/activity";

export const KIND_LABEL: Record<Kind, string> = {
  kept: "Big keeping", volume: "Huge volume", jump: "Delivery jump", collapse: "Delivery collapse",
};
const head = "h-row-head px-3 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground";
const x = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}×`);

/** One row per unusual stock; NIFTY 50 members (on that date) link to their Report Card. */
export default function ActivityTable({ rows, empty }: { rows: ActivityRow[]; empty: string }) {
  if (rows.length === 0) return <p className="px-card-x py-8 text-body-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="max-h-[560px] overflow-auto">
      <Table className="tabular-nums">
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(head, "pl-card-x")}>Stock</TableHead>
            <TableHead className={head}>What was unusual</TableHead>
            <TableHead className={cn(head, "text-right")}>Kept vs normal</TableHead>
            <TableHead className={cn(head, "text-right")}>Volume vs normal</TableHead>
            <TableHead className={cn(head, "text-right")}>Delivery % (usual)</TableHead>
            <TableHead className={cn(head, "text-right")}>Price</TableHead>
            <TableHead className={cn(head, "pr-card-x text-right")}>Traded</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.symbol} className="hover:bg-raised">
              <TableCell className="py-cell pl-card-x pr-3 text-body-sm font-semibold text-foreground">
                {r.member ? (
                  <Link href={`/stock/${encodeURIComponent(r.symbol)}`} prefetch={false} className="hover:underline">{r.symbol}</Link>
                ) : r.symbol}
              </TableCell>
              <TableCell className="px-3 py-cell">
                <div className="flex flex-wrap gap-1">
                  {KINDS.filter((k) => r[k]).map((k) => <Badge key={k} variant="neutral">{KIND_LABEL[k]}</Badge>)}
                </div>
              </TableCell>
              <TableCell className={cn("px-3 py-cell text-right text-body-sm", r.kept ? "font-semibold text-foreground" : "text-muted-foreground")}>{x(r.keptRatio)}</TableCell>
              <TableCell className={cn("px-3 py-cell text-right text-body-sm", r.volume ? "font-semibold text-foreground" : "text-muted-foreground")}>{x(r.volumeRatio)}</TableCell>
              <TableCell className={cn("px-3 py-cell text-right text-body-sm", r.jump || r.collapse ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {r.deliveryPct === null ? "—" : `${r.deliveryPct.toFixed(0)}%`}
                {r.usualDeliveryPct !== null && <span className="text-muted-foreground"> ({r.usualDeliveryPct.toFixed(0)}%)</span>}
              </TableCell>
              <TableCell className={cn("px-3 py-cell text-right text-body-sm font-medium", r.changePct === null ? "text-muted-foreground" : r.changePct >= 0 ? "text-up" : "text-down")}>
                {r.changePct === null ? "—" : `${signed(r.changePct, 1)}%`}
              </TableCell>
              <TableCell className="py-cell pl-3 pr-card-x text-right text-body-sm text-foreground-2">{formatCrore(r.turnover)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: `src/app/activity/page.tsx`:**

```tsx
import Link from "next/link";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import DateNav from "@/components/DateNav";
import Hotkeys from "@/components/Hotkeys";
import SlidingPill from "@/components/SlidingPill";
import Term from "@/components/Term";
import ActivityTable, { KIND_LABEL } from "@/components/ActivityTable";
import { Badge } from "@/components/ui/badge";
import { Card, CardFooter } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { KINDS, type Kind } from "@/indicators/activity";
import type { MaKind } from "@/query/breadth";
import {
  activityFirst, activityNeighbours, activityOn, activitySession, filterKinds, kindCounts, type ActivitySet,
} from "@/query/activity";

export const dynamic = "force-dynamic";

// Every search param is checked with strict comparisons and falls back to its
// default (CLAUDE.md): nothing from the URL reaches SQL except a checked date.
function isMaKind(v: string | undefined): v is MaKind {
  return v === "sma200" || v === "ema200" || v === "sma50";
}
function isSet(v: string | undefined): v is ActivitySet {
  return v === "all" || v === "nifty50";
}
function isKind(v: string): v is Kind {
  return v === "kept" || v === "volume" || v === "jump" || v === "collapse";
}
function cleanKinds(v: string | undefined): Kind[] {
  const picked = (v ?? "").split(",").filter(isKind);
  return picked.length ? KINDS.filter((k) => picked.includes(k)) : [...KINDS];
}
function cleanDate(v: string | undefined): string | undefined {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}
const TERM: Record<Kind, "big-keeping" | "huge-volume" | "delivery-jump" | "delivery-collapse"> = {
  kept: "big-keeping", volume: "huge-volume", jump: "delivery-jump", collapse: "delivery-collapse",
};
const seg = (on: boolean) =>
  cn(
    "inline-flex h-8 items-center gap-2 rounded-[8px] px-3 text-body-sm font-medium transition-colors",
    on ? "bg-thumb text-foreground shadow-thumb" : "text-muted-foreground hover:text-foreground",
  );

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ma?: string; date?: string; set?: string; kinds?: string }>;
}) {
  const sp = await searchParams;
  const ma: MaKind = isMaKind(sp.ma) ? sp.ma : "sma200";
  const set: ActivitySet = isSet(sp.set) ? sp.set : "all";
  const kinds = cleanKinds(sp.kinds);
  const wanted = cleanDate(sp.date);

  const date = await activitySession(wanted);
  const latest = await activitySession();
  const first = await activityFirst();
  const nav = date ? await activityNeighbours(date) : { prev: null, next: null };
  const all = date ? await activityOn(date, set) : [];
  const counts = kindCounts(all);
  const shown = filterKinds(all, kinds);

  const extra = (p: { set?: ActivitySet; kinds?: Kind[] } = {}) =>
    `&set=${p.set ?? set}&kinds=${(p.kinds ?? kinds).join(",")}`;
  const href = (p: { set?: ActivitySet; kinds?: Kind[] }) =>
    `/activity?ma=${ma}${date && wanted ? `&date=${date}` : ""}${extra(p)}`;
  const toggle = (k: Kind) => {
    const next = kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k];
    return href({ kinds: next.length ? KINDS.filter((x) => next.includes(x)) : [...KINDS] });
  };
  const scope = set === "nifty50" ? "NIFTY 50 members" : "active stocks";

  return (
    <AppShell current="activity" ma={ma} asOf={latest}>
      <Hotkeys ma={ma} prev={nav.prev} next={nav.next} page="activity" extra={extra()} />
      <PageHeader
        eyebrow="All NSE · Stocks"
        title="Unusual activity"
        description="Stocks whose session was far outside their own normal: shares kept, shares traded, or the share kept. Facts about the day, not predictions."
        actions={
          <DateNav
            base="/activity"
            extra={extra()}
            ma={ma}
            date={date}
            requested={wanted ?? null}
            snapped={Boolean(wanted && date && date !== wanted)}
            prev={nav.prev}
            next={nav.next}
            min={first ?? undefined}
            max={latest}
          />
        }
      />

      {!date ? (
        <Card className="px-6 py-12 text-center">
          <p className="text-heading text-foreground">Nothing loaded for that session</p>
          <p className="mt-2 text-body-sm text-foreground-2">
            Run <code className="rounded-sm bg-raised px-1.5 py-0.5 font-mono text-[12px]">bun run activity</code>.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-card-x py-3">
            <div className="seg relative inline-flex items-center gap-0.5 rounded-md border bg-raised p-0.5" role="tablist" aria-label="Stocks">
              <SlidingPill active={set} />
              {([["all", "All active stocks"], ["nifty50", "NIFTY 50"]] as const).map(([k, text]) => (
                <Link key={k} href={href({ set: k })} role="tab" aria-selected={set === k} className={seg(set === k)}>{text}</Link>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Kinds">
              {KINDS.map((k) => (
                <Link key={k} href={toggle(k)} aria-pressed={kinds.includes(k)}
                  className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors",
                    kinds.includes(k) ? "border-brand bg-brand-soft text-brand" : "text-muted-foreground hover:text-foreground")}>
                  {KIND_LABEL[k]}
                  <span className="font-mono text-[11px]">{counts[k]}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-start justify-between gap-3 px-card-x pb-2 pt-4">
            <div>
              <h2 className="text-heading text-foreground">
                {all.length} {scope} had an <Term id="unusual-activity">unusual</Term> day on {formatDate(date)}
              </h2>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Sorted by how far outside normal. {kinds.map((k) => <span key={k}><Term id={TERM[k]}>{KIND_LABEL[k]}</Term>{" "}</span>)}
                · Our research found big delivery days don&apos;t reliably lead to gains (<Link href="/learn/unusual-activity" className="text-brand hover:underline">why</Link>).
              </p>
            </div>
            <Badge variant="neutral">{shown.length} {shown.length === 1 ? "stock" : "stocks"}</Badge>
          </div>

          <ActivityTable
            rows={shown}
            empty={all.length === 0 ? `No ${scope} had an unusual day on ${formatDate(date)}.` : "No stock matched these filters."}
          />
          <CardFooter>
            Each stock against its own last 20 sessions; stocks trading under ₹1 crore a day and ETFs are left out.
            Report Cards cover the NIFTY 50 for now, so only members link to one.
          </CardFooter>
        </Card>
      )}
    </AppShell>
  );
}
```

Check against the design system README while writing; adjust classes only to tokens it names. If `DateNav`'s `min` prop is typed `string`, pass `first ?? latest ?? ""`.

- [ ] **Step 3: `src/components/UnusualDaysCard.tsx`:**

```tsx
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Term from "@/components/Term";
import { KIND_LABEL } from "@/components/ActivityTable";
import { formatDate, signed } from "@/lib/format";
import { cn } from "@/lib/utils";
import { KINDS } from "@/indicators/activity";
import type { ActivityRow } from "@/query/activity";

const x = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}×`);

/** A NIFTY 50 stock's unusual days in the last 3 months. Facts only. */
export default function UnusualDaysCard({ rows, className }: { rows: ActivityRow[]; className?: string }) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="border-b px-card-x py-3.5">
        <h3 className="text-heading text-foreground"><Term id="unusual-activity">Unusual days</Term>, last 3 months</h3>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Against this stock&apos;s own last 20 sessions. What happened, not what comes next.</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-card-x py-6 text-body-sm text-muted-foreground">None in the last 3 months.</p>
      ) : (
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.tradeDate} className="flex flex-wrap items-center justify-between gap-2 px-card-x py-cell text-body-sm">
              <span className="font-medium text-foreground">{formatDate(r.tradeDate)}</span>
              <span className="flex flex-wrap gap-1">{KINDS.filter((k) => r[k]).map((k) => <Badge key={k} variant="neutral">{KIND_LABEL[k]}</Badge>)}</span>
              <span className="tabular-nums text-foreground-2">
                kept {x(r.keptRatio)} · volume {x(r.volumeRatio)}
                {r.deliveryPct !== null && r.usualDeliveryPct !== null && ` · delivery ${r.deliveryPct.toFixed(0)}% (usual ${r.usualDeliveryPct.toFixed(0)}%)`}
              </span>
              <span className={cn("tabular-nums font-medium", r.changePct === null ? "text-muted-foreground" : r.changePct >= 0 ? "text-up" : "text-down")}>
                {r.changePct === null ? "—" : `${signed(r.changePct, 1)}%`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

- [ ] **Step 4: Report Card.** In `src/app/stock/[symbol]/page.tsx`: import `UnusualDaysCard` and `recentUnusual`; after `const r = res.report;` add `const unusual = await recentUnusual(symbol, r.date);`; after the closing `</div>` of the `xl:grid-cols-12` grid (still inside the `flex flex-col gap-cards` div) add `<UnusualDaysCard rows={unusual} />`.

- [ ] **Step 5: Typecheck and full suite** `bunx tsc --noEmit && bun test` — Expected: all PASS (density and tailwind-v4 tests included).

- [ ] **Step 6: See it working.** Start `bun run dev -- -p 3100` (not :3000, which is production). Load `http://localhost:3100/activity`, `/activity?set=nifty50`, `/activity?kinds=kept`, `/activity?kinds=nonsense` (falls back to all four), `/activity?date=2020-03-23`, a weekend date (snaps), and `/stock/RELIANCE` (card present). Check light and dark (`t`), compact and comfortable (`d`), the `u` shortcut, and a phone-width view. Fix anything off. Stop the dev server.

- [ ] **Step 7: Commit** `git add src/app/activity src/components/ActivityTable.tsx src/components/UnusualDaysCard.tsx "src/app/stock/[symbol]/page.tsx" && git commit -m "Unusual activity page and the Report Card's unusual days card"`

---

### Task 7: Docs and production

**Files:** Create `docs/decisions/0023-unusual-activity.md`; modify `docs/decisions/README.md`, `docs/pipelines.md`, `README.md`, `CLAUDE.md`, `TODO.md`.

- [ ] **Step 1: Decision 0023** (plain language): Problem (owner wants to see where money suddenly went in/out; tracking, not prediction) · What counts as unusual (four kinds, thresholds 5× / ±30 points, chosen so ~5% of active stocks flag per day; the measured per-day counts from Task 3 Step 6) · Stored events vs computing on page load (and why) · Full nightly rebuild in one transaction · ETFs out, ₹1 crore filter, NIFTY 50 switch point-in-time · Report Cards only for NIFTY 50 (non-members unlinked) · Revisit when (Report Cards for every stock; alerts; thresholds after owner feedback).

- [ ] **Step 2: Other docs.** `docs/decisions/README.md` row for 0023. `docs/pipelines.md`: pipeline 12 "Unusual activity" (what, source, writes `unusual_days`, nightly ✅ after averages, by hand `bun run activity`, code, why 0023) and the nightly order line. `README.md`: commands row (`bun run activity`), schema block (`unusual_days`), function reference (`src/indicators/activity.ts`, `compute-activity.ts`, `universe.ts`, `src/query/activity.ts`). `CLAUDE.md`: in "What this is" add `/activity` (`src/query/activity.ts` + `src/indicators/activity.ts`: each session's unusual stock-days, whole market or NIFTY 50); command `bun run activity`; one line under load-bearing decisions: "Delivery/volume 'normal' and the ETF universe live once in `src/indicators/activity.ts` / `universe.ts`, shared by research 0003 and the page." `TODO.md`: Where we left off.

- [ ] **Step 3: Full suite** `bun test && bunx tsc --noEmit` — Expected: all PASS.

- [ ] **Step 4: Commit** `git add docs README.md CLAUDE.md TODO.md && git commit -m "Docs: Unusual activity (decision 0023, pipelines, README, CLAUDE.md, TODO)"`

- [ ] **Step 5: Production** (after merge to main): `bun run build`, then restart the detached `bun run start` on :3000 the way `port-3000-is-production` describes (log `~/Library/Logs/tradesence-web.log`), and load `http://localhost:3000/activity` to confirm 200.
