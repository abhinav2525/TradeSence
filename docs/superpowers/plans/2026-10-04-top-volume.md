# Top volume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/volume` page ranking the ~750 Nifty Total Market stocks by ₹ value or shares traded over the last 1/5/21/63/126 sessions, filterable by size, sector and index, from nightly-refreshed NSE index lists and a nightly-computed table.

**Architecture:** `src/ingest/index-constituents.ts` downloads 43 verified NSE index member lists into `index_constituents` (replaced per index, never emptied by a failed download). `src/indicators/volume-leaders.ts` computes per-stock window totals through `loadAdjustedHistory` into `volume_leaders` (replaced in one transaction). `src/query/volume.ts` joins the two for the page.

**Tech Stack:** Bun, TypeScript, Next.js 16 server components, drizzle + Postgres, Tailwind v4 tokens, `bun:test`.

**Spec:** `docs/superpowers/specs/2026-10-04-top-volume-design.md`

## Global Constraints

- Universe = members of `ind_niftytotalmarket_list.csv`; sector = its `Industry`.
- Size: Large = Nifty 100, Mid = Midcap 150, Small = Smallcap 250, Micro = Microcap 250; each universe stock in exactly one, else a WARNING naming it.
- Periods: last 1, 5, 21, 63, 126 **market sessions** (bhavcopy `ok` days in `ingest_log`) ending at the latest one. A stock's totals use its rows inside that date range; `sessions` = how many it has.
- `turnover` = Σ bhavcopy turnover; `shares` = Σ volume × `shareFactors`; `change_pct` = adjusted close on its last row in the window vs its last row before the window, same segment, else null.
- Every list download: header must list all five columns read (`Company Name, Industry, Symbol, Series, ISIN Code`); an HTML page, wrong header or zero rows is an error; a failed index keeps yesterday's members.
- Search params validated by strict comparison against fixed sets (CLAUDE.md). Tokens only in UI; density tokens; no `<Term>` inside links; glossary entry per new term.
- Page copy: facts only; "Heavy trading shows where money moved, not where prices go next." No research findings.
- Tests from the repo root. `drizzle/` only via `bun run db:generate`.

## Review Focus

- NSE renames a stock: today's list carries the new symbol; `loadAdjustedHistory` must still find its old-symbol history (it does via lineage) — check one renamed member's totals span the rename.
- A universe stock with no price rows at all (just listed today): no `volume_leaders` row; the page simply doesn't list it, never crashes.
- The index picker given an unknown key, or a key whose list failed to load and has no members: falls back / shows the empty state.
- `shares` across a 1:5 split inside 126 sessions: adjusted, not inflated 5×.
- A failed download for the Total Market list itself: the whole universe must stay as yesterday's, not shrink to zero.

---

### Task 1: Index lists — parser, verified files, ingest, size groups

**Files:** Create `src/ingest/index-constituents.ts`, `src/ingest/cli-index-lists.ts`, `tests/index-constituents.test.ts`; modify `src/db/schema.ts` (+ migration), `package.json`, `src/ingest/cli-nightly.ts`.

**Interfaces — produces:**
- `INDEX_LISTS: readonly { key: string; name: string; file: string; group: "broad" | "sector" | "theme" }[]` (43 rows below)
- `UNIVERSE_KEY = "total-market"`; `SIZE_KEYS = { large: "nifty-100", mid: "midcap-150", small: "smallcap-250", micro: "microcap-250" }`
- `type Constituent = { symbol: string; industry: string }`
- `parseConstituents(csv: string): Constituent[]`
- `fetchConstituents(file: string, deps?: { download?: typeof download }): Promise<{ status: "ok"; rows: Constituent[] } | { status: "error"; message: string }>`
- `ingestIndexLists(opts?: { download?: typeof download; delayMs?: number }): Promise<{ ok: number; failed: string[]; sizeProblems: string[] }>`
- `sizeProblems(universe: string[], sizes: Record<"large"|"mid"|"small"|"micro", string[]>): string[]`
- table `schema.indexConstituents` (`index_key`, `symbol`, `industry`, `fetched_on`; PK index_key + symbol)

The 43 verified files (checked live 4 Oct 2026; `key` is the URL value, `name` the label):

```ts
export const INDEX_LISTS = [
  { key: "total-market", name: "Nifty Total Market", file: "ind_niftytotalmarket_list.csv", group: "broad" },
  { key: "nifty-50", name: "NIFTY 50", file: "ind_nifty50list.csv", group: "broad" },
  { key: "next-50", name: "Nifty Next 50", file: "ind_niftynext50list.csv", group: "broad" },
  { key: "nifty-100", name: "Nifty 100", file: "ind_nifty100list.csv", group: "broad" },
  { key: "nifty-200", name: "Nifty 200", file: "ind_nifty200list.csv", group: "broad" },
  { key: "nifty-500", name: "Nifty 500", file: "ind_nifty500list.csv", group: "broad" },
  { key: "midcap-50", name: "Nifty Midcap 50", file: "ind_niftymidcap50list.csv", group: "broad" },
  { key: "midcap-100", name: "Nifty Midcap 100", file: "ind_niftymidcap100list.csv", group: "broad" },
  { key: "midcap-150", name: "Nifty Midcap 150", file: "ind_niftymidcap150list.csv", group: "broad" },
  { key: "smallcap-50", name: "Nifty Smallcap 50", file: "ind_niftysmallcap50list.csv", group: "broad" },
  { key: "smallcap-100", name: "Nifty Smallcap 100", file: "ind_niftysmallcap100list.csv", group: "broad" },
  { key: "smallcap-250", name: "Nifty Smallcap 250", file: "ind_niftysmallcap250list.csv", group: "broad" },
  { key: "microcap-250", name: "Nifty Microcap 250", file: "ind_niftymicrocap250_list.csv", group: "broad" },
  { key: "midsmallcap-400", name: "Nifty MidSmallcap 400", file: "ind_niftymidsmallcap400list.csv", group: "broad" },
  { key: "largemidcap-250", name: "Nifty LargeMidcap 250", file: "ind_niftylargemidcap250list.csv", group: "broad" },
  { key: "bank", name: "Nifty Bank", file: "ind_niftybanklist.csv", group: "sector" },
  { key: "private-bank", name: "Nifty Private Bank", file: "ind_nifty_privatebanklist.csv", group: "sector" },
  { key: "psu-bank", name: "Nifty PSU Bank", file: "ind_niftypsubanklist.csv", group: "sector" },
  { key: "financial-services", name: "Nifty Financial Services", file: "ind_niftyfinancelist.csv", group: "sector" },
  { key: "fin-ex-bank", name: "Nifty Financial Services Ex-Bank", file: "ind_niftyfinancialservicesexbank_list.csv", group: "sector" },
  { key: "fin-25-50", name: "Nifty Financial Services 25/50", file: "ind_niftyfinancialservices25_50list.csv", group: "sector" },
  { key: "it", name: "Nifty IT", file: "ind_niftyitlist.csv", group: "sector" },
  { key: "pharma", name: "Nifty Pharma", file: "ind_niftypharmalist.csv", group: "sector" },
  { key: "healthcare", name: "Nifty Healthcare", file: "ind_niftyhealthcarelist.csv", group: "sector" },
  { key: "auto", name: "Nifty Auto", file: "ind_niftyautolist.csv", group: "sector" },
  { key: "fmcg", name: "Nifty FMCG", file: "ind_niftyfmcglist.csv", group: "sector" },
  { key: "metal", name: "Nifty Metal", file: "ind_niftymetallist.csv", group: "sector" },
  { key: "realty", name: "Nifty Realty", file: "ind_niftyrealtylist.csv", group: "sector" },
  { key: "energy", name: "Nifty Energy", file: "ind_niftyenergylist.csv", group: "sector" },
  { key: "oil-gas", name: "Nifty Oil & Gas", file: "ind_niftyoilgaslist.csv", group: "sector" },
  { key: "media", name: "Nifty Media", file: "ind_niftymedialist.csv", group: "sector" },
  { key: "consumer-durables", name: "Nifty Consumer Durables", file: "ind_niftyconsumerdurableslist.csv", group: "sector" },
  { key: "cpse", name: "Nifty CPSE", file: "ind_niftycpselist.csv", group: "theme" },
  { key: "pse", name: "Nifty PSE", file: "ind_niftypselist.csv", group: "theme" },
  { key: "mnc", name: "Nifty MNC", file: "ind_niftymnclist.csv", group: "theme" },
  { key: "defence", name: "Nifty India Defence", file: "ind_niftyindiadefence_list.csv", group: "theme" },
  { key: "commodities", name: "Nifty Commodities", file: "ind_niftycommoditieslist.csv", group: "theme" },
  { key: "infrastructure", name: "Nifty Infrastructure", file: "ind_niftyinfralist.csv", group: "theme" },
  { key: "consumption", name: "Nifty India Consumption", file: "ind_niftyconsumptionlist.csv", group: "theme" },
  { key: "manufacturing", name: "Nifty India Manufacturing", file: "ind_niftyindiamanufacturing_list.csv", group: "theme" },
  { key: "digital", name: "Nifty India Digital", file: "ind_niftyindiadigital_list.csv", group: "theme" },
  { key: "tourism", name: "Nifty India Tourism", file: "ind_niftyindiatourism_list.csv", group: "theme" },
  { key: "mobility", name: "Nifty Mobility", file: "ind_niftymobility_list.csv", group: "theme" },
] as const;
```

- [ ] **Step 1: Schema.** Add to `src/db/schema.ts` (after `fundSymbols`):

```ts
/**
 * Today's members of NSE indices (Top volume page): one row per index and stock,
 * from NSE's ind_*list.csv files, replaced per index each night. A failed
 * download keeps yesterday's rows. `industry` is NSE's sector for the stock.
 */
export const indexConstituents = pgTable(
  "index_constituents",
  {
    indexKey: text("index_key").notNull(),
    symbol: text("symbol").notNull(),
    industry: text("industry").notNull(),
    fetchedOn: date("fetched_on").notNull(),
  },
  (t) => [primaryKey({ columns: [t.indexKey, t.symbol] }), index("index_constituents_symbol_idx").on(t.symbol)],
);
```

Run `bun run db:generate && bun run db:migrate` and the test-DB migrate (`DATABASE_URL=$(sed -n 's/^DATABASE_URL=//p' .env | sed 's|/tradesence$|/tradesence_test|') bunx drizzle-kit migrate`).

- [ ] **Step 2: Failing tests** — `tests/index-constituents.test.ts`:

```ts
import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import {
  INDEX_LISTS, SIZE_KEYS, UNIVERSE_KEY, fetchConstituents, ingestIndexLists, parseConstituents, sizeProblems,
} from "../src/ingest/index-constituents";

// Rows copied from NSE's ind_niftytotalmarket_list.csv (4 Oct 2026).
const FILE = [
  "Company Name,Industry,Symbol,Series,ISIN Code",
  "360 ONE WAM Ltd.,Financial Services,360ONE,EQ,INE466L01038",
  "ABB India Ltd.,Capital Goods,ABB,EQ,INE117A01022",
].join("\r\n");
const bytes = (s: string) => new TextEncoder().encode(s);

describe("parseConstituents", () => {
  test("reads symbol and NSE industry", () => {
    expect(parseConstituents(FILE)).toEqual([
      { symbol: "360ONE", industry: "Financial Services" },
      { symbol: "ABB", industry: "Capital Goods" },
    ]);
  });
  test("refuses a header that lost a column it reads", () => {
    expect(() => parseConstituents(FILE.replace("Industry", "Sector"))).toThrow(/header/);
  });
  test("company names with commas in quotes don't shift the columns", () => {
    const f = FILE + '\r\n"Tata Motors, Ltd.",Automobile and Auto Components,TATAMOTORS,EQ,INE155A01022';
    expect(parseConstituents(f).at(-1)).toEqual({ symbol: "TATAMOTORS", industry: "Automobile and Auto Components" });
  });
});

describe("fetchConstituents", () => {
  test("an HTML page or empty list is an error, never an empty index", async () => {
    expect((await fetchConstituents("x.csv", { download: async () => ({ kind: "ok", bytes: bytes("<html>Access Denied</html>") }) })).status).toBe("error");
    expect((await fetchConstituents("x.csv", { download: async () => ({ kind: "ok", bytes: bytes("Company Name,Industry,Symbol,Series,ISIN Code") }) })).status).toBe("error");
  });
  test("downloads a real list from NSE", async () => {
    const r = await fetchConstituents("ind_niftybanklist.csv");
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.rows.some((x) => x.symbol === "HDFCBANK")).toBe(true);
  }, 30000);
});

describe("sizeProblems", () => {
  test("every universe stock in exactly one size list", () => {
    expect(sizeProblems(["A", "B", "C"], { large: ["A"], mid: ["B"], small: ["C"], micro: [] })).toEqual([]);
    expect(sizeProblems(["A", "B"], { large: ["A"], mid: ["A"], small: [], micro: [] })).toEqual(["A is in 2 size lists", "B is in no size list"]);
  });
});

describe("ingestIndexLists", () => {
  beforeEach(async () => { await db.delete(schema.indexConstituents); });
  test("stores every list; a failed one keeps yesterday's members", async () => {
    await db.insert(schema.indexConstituents).values({ indexKey: "bank", symbol: "OLDBANK", industry: "Financial Services", fetchedOn: "2026-10-01" });
    const download = async (url: string) =>
      url.endsWith("ind_niftybanklist.csv") ? ({ kind: "failed" as const, message: "timeout" }) : ({ kind: "ok" as const, bytes: bytes(FILE) });
    const r = await ingestIndexLists({ download, delayMs: 0 });
    expect(r.failed).toEqual(["Nifty Bank"]);
    expect(r.ok).toBe(INDEX_LISTS.length - 1);
    const bank = await db.select().from(schema.indexConstituents).where((await import("drizzle-orm")).eq(schema.indexConstituents.indexKey, "bank"));
    expect(bank.map((b) => b.symbol)).toEqual(["OLDBANK"]);
    expect(UNIVERSE_KEY).toBe("total-market");
    expect(SIZE_KEYS.large).toBe("nifty-100");
  });
});
```

- [ ] **Step 3: Run** `bun test tests/index-constituents.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 4: Implement** `src/ingest/index-constituents.ts` (the `INDEX_LISTS` block above, plus):

```ts
/**
 * Today's members of 43 NSE indices, from nsearchives.nseindia.com/content/indices
 * (Top volume page; spec 2026-10-04). Nifty Total Market is the universe and its
 * `Industry` column the sector; Nifty 100 / Midcap 150 / Smallcap 250 / Microcap
 * 250 are the size groups. Each index is replaced in its own transaction; a failed
 * or empty download keeps yesterday's members.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { download } from "./bhavcopy";

const BASE = "https://nsearchives.nseindia.com/content/indices/";
const REQUIRED = ["Company Name", "Industry", "Symbol", "Series", "ISIN Code"];

// INDEX_LISTS (43 rows, as in the plan) goes here.

export const UNIVERSE_KEY = "total-market";
export const SIZE_KEYS = { large: "nifty-100", mid: "midcap-150", small: "smallcap-250", micro: "microcap-250" } as const;

export type Constituent = { symbol: string; industry: string };

/** Splits one CSV line, honouring double quotes (company names can hold commas). */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export function parseConstituents(csv: string): Constituent[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  const cols = cells(lines[0] ?? "");
  const missing = REQUIRED.filter((c) => !cols.includes(c));
  if (missing.length) throw new Error(`Unrecognised index list header (missing: ${missing.join(", ")})`);
  const iSym = cols.indexOf("Symbol"), iInd = cols.indexOf("Industry");
  return lines.slice(1).map(cells).filter((f) => f[iSym]).map((f) => ({ symbol: f[iSym]!, industry: f[iInd] ?? "" }));
}

export async function fetchConstituents(file: string, deps: { download?: typeof download } = {}) {
  const res = await (deps.download ?? download)(BASE + file);
  if (res.kind !== "ok") return { status: "error" as const, message: res.kind === "failed" ? res.message : "HTTP 404" };
  try {
    const rows = parseConstituents(new TextDecoder().decode(res.bytes));
    if (rows.length === 0) return { status: "error" as const, message: "list had no rows" };
    return { status: "ok" as const, rows };
  } catch (e) {
    return { status: "error" as const, message: e instanceof Error ? e.message : String(e) };
  }
}

export function sizeProblems(universe: string[], sizes: Record<keyof typeof SIZE_KEYS, string[]>): string[] {
  const sets = Object.values(sizes).map((s) => new Set(s));
  return universe.flatMap((sym) => {
    const n = sets.filter((s) => s.has(sym)).length;
    return n === 1 ? [] : [n === 0 ? `${sym} is in no size list` : `${sym} is in ${n} size lists`];
  });
}

export async function ingestIndexLists(opts: { download?: typeof download; delayMs?: number } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const failed: string[] = [];
  let ok = 0;
  for (const [i, ix] of INDEX_LISTS.entries()) {
    const r = await fetchConstituents(ix.file, { download: opts.download });
    if (r.status === "error") failed.push(ix.name);
    else {
      const rows = [...new Map(r.rows.map((x) => [x.symbol, x])).values()]; // NSE can repeat a row
      await db.transaction(async (tx) => {
        await tx.delete(schema.indexConstituents).where(eq(schema.indexConstituents.indexKey, ix.key));
        await tx.insert(schema.indexConstituents).values(rows.map((x) => ({ indexKey: ix.key, symbol: x.symbol, industry: x.industry, fetchedOn: today })));
      });
      ok++;
    }
    if (i < INDEX_LISTS.length - 1) await new Promise((res) => setTimeout(res, opts.delayMs ?? 300));
  }
  const members = async (key: string) =>
    (await db.select({ s: schema.indexConstituents.symbol }).from(schema.indexConstituents).where(eq(schema.indexConstituents.indexKey, key))).map((r) => r.s);
  const problems = sizeProblems(await members(UNIVERSE_KEY), {
    large: await members(SIZE_KEYS.large), mid: await members(SIZE_KEYS.mid),
    small: await members(SIZE_KEYS.small), micro: await members(SIZE_KEYS.micro),
  });
  return { ok, failed, sizeProblems: problems };
}
```

`src/ingest/cli-index-lists.ts`:

```ts
/** Refreshes today's NSE index member lists. bun run ingest:index-lists */
import { sql } from "../db";
import { ingestIndexLists } from "./index-constituents";

const r = await ingestIndexLists();
console.log(`[index lists] ${r.ok} loaded${r.failed.length ? `, failed: ${r.failed.join(", ")}` : ""}`);
for (const p of r.sizeProblems) console.warn(`[index lists] WARNING ${p}`);
await sql.end();
```

`package.json` scripts after `ingest:delivery`: `"ingest:index-lists": "bun run src/ingest/cli-index-lists.ts",`

In `src/ingest/cli-nightly.ts`, before the fund-symbols block, add:

```ts
// Today's NSE index members (Top volume page). Failed lists keep yesterday's members.
const lists = await ingestIndexLists();
console.log(`[nightly] index lists: ${lists.ok} loaded`);
if (lists.failed.length) console.warn(`[nightly] WARNING index lists not refreshed: ${lists.failed.join(", ")}`);
for (const p of lists.sizeProblems) console.warn(`[nightly] WARNING size group: ${p}`);
```

and import `ingestIndexLists` from `./index-constituents`.

- [ ] **Step 5: Run** `bun test tests/index-constituents.test.ts && bunx tsc --noEmit` — Expected: PASS. Then `bun run ingest:index-lists` — Expected: 43 loaded, and either no size warnings or a short list to note in the decision file.

- [ ] **Step 6: Commit** `git add src/db/schema.ts drizzle src/ingest/index-constituents.ts src/ingest/cli-index-lists.ts src/ingest/cli-nightly.ts package.json tests/index-constituents.test.ts && git commit -m "NSE index member lists: 43 indices, nightly, sizes and sectors"`

---

### Task 2: Leaderboard numbers

**Files:** Create `src/indicators/volume-leaders.ts`, `src/indicators/compute-volume-leaders.ts`, `tests/volume-leaders.test.ts`; modify `src/db/schema.ts` (+ migration), `src/ingest/cli-nightly.ts`, `package.json`.

**Interfaces — produces:**
- `PERIODS = [1, 5, 21, 63, 126] as const`; `type Period = (typeof PERIODS)[number]`
- `type LeaderStat = { period: Period; turnover: number; shares: number; changePct: number | null; sessions: number }`
- `leaderStats(h: History, windowStarts: Record<Period, string>, lastDay: string): LeaderStat[]` — `windowStarts[p]` = first market session of the window
- `computeVolumeLeaders(opts?: { symbols?: string[] }): Promise<{ rows: number; asOf: string | null }>`
- table `schema.volumeLeaders` (`as_of`, `symbol`, `period` int, `turnover`, `shares`, `change_pct`, `sessions`, `unusual_days`; PK symbol + period)

- [ ] **Step 1: Schema** (after `indexConstituents`):

```ts
/**
 * Top volume page: each Nifty Total Market stock's totals over the last 1, 5, 21,
 * 63 and 126 market sessions ending `as_of`. Rebuilt in full nightly in one
 * transaction. `shares` are split/bonus-adjusted to today's share terms.
 */
export const volumeLeaders = pgTable(
  "volume_leaders",
  {
    asOf: date("as_of").notNull(),
    symbol: text("symbol").notNull(),
    period: integer("period").notNull(),
    turnover: doublePrecision("turnover").notNull(),
    shares: doublePrecision("shares").notNull(),
    changePct: doublePrecision("change_pct"),
    sessions: integer("sessions").notNull(),
    unusualDays: integer("unusual_days").notNull(),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.period] })],
);
```

Generate + migrate both databases as in Task 1.

- [ ] **Step 2: Failing tests** — `tests/volume-leaders.test.ts`:

```ts
import { test, expect, describe, beforeEach } from "bun:test";
import type { History } from "../src/indicators/history";
import { leaderStats, PERIODS } from "../src/indicators/volume-leaders";
import { db, schema } from "../src/db";
import { computeVolumeLeaders } from "../src/indicators/compute-volume-leaders";

function hist(n: number, over: Partial<Record<keyof History, unknown[]>> = {}): History {
  const dates: string[] = [];
  const d = new Date("2026-03-02T00:00:00Z");
  while (dates.length < n) {
    if (d.getUTCDay() % 6 !== 0) dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const fill = <T,>(v: T) => dates.map(() => v);
  return {
    dates, open: fill(100), high: fill(101), low: fill(99), close: fill(100), volume: fill(1000),
    turnover: fill(1e5), factors: fill(1), shareFactors: fill(1), traded: fill(null), delivered: fill(null), ...over,
  } as History;
}
const starts = (h: History) => Object.fromEntries(PERIODS.map((p) => [p, h.dates[h.dates.length - p]!])) as Record<(typeof PERIODS)[number], string>;

describe("leaderStats", () => {
  test("sums turnover and shares over each window", () => {
    const h = hist(200);
    const s = leaderStats(h, starts(h), h.dates.at(-1)!);
    expect(s.find((x) => x.period === 5)).toMatchObject({ turnover: 5e5, shares: 5000, sessions: 5 });
    expect(s.find((x) => x.period === 126)).toMatchObject({ turnover: 126e5, shares: 126000, sessions: 126 });
  });

  test("a 1:5 split inside the window doesn't inflate shares", () => {
    const n = 200, cut = 150;
    const h = hist(n, {
      volume: Array.from({ length: n }, (_, i) => (i < cut ? 1000 : 5000)),
      shareFactors: Array.from({ length: n }, (_, i) => (i < cut ? 5 : 1)),
      factors: Array.from({ length: n }, (_, i) => (i < cut ? 5 : 1)),
      close: Array.from({ length: n }, (_, i) => (i < cut ? 500 : 100)),
    });
    expect(leaderStats(h, starts(h), h.dates.at(-1)!).find((x) => x.period === 126)!.shares).toBe(126 * 5000);
  });

  test("price move: adjusted close at the end vs the last close before the window", () => {
    const h = hist(200, { close: Array.from({ length: 200 }, (_, i) => (i < 195 ? 100 : 110)) });
    expect(leaderStats(h, starts(h), h.dates.at(-1)!).find((x) => x.period === 5)!.changePct).toBeCloseTo(10, 9);
  });

  test("a short history counts only the sessions it has", () => {
    const h = hist(10);
    const allStarts = Object.fromEntries(PERIODS.map((p) => [p, "2025-01-01"])) as Record<(typeof PERIODS)[number], string>;
    const s = leaderStats(h, allStarts, h.dates.at(-1)!).find((x) => x.period === 126)!;
    expect(s.sessions).toBe(10);
    expect(s.changePct).toBeNull(); // nothing before the window to compare with
  });

  test("a stock that didn't trade in the window gets no row", () => {
    const h = hist(50);
    const later = Object.fromEntries(PERIODS.map((p) => [p, "2027-01-01"])) as Record<(typeof PERIODS)[number], string>;
    expect(leaderStats(h, later, "2027-01-08")).toEqual([]);
  });
});

describe("computeVolumeLeaders", () => {
  beforeEach(async () => {
    for (const t of [schema.dailyPrices, schema.ingestLog, schema.volumeLeaders, schema.unusualDays, schema.indexConstituents]) await db.delete(t);
  });
  test("writes five periods per universe stock, counting unusual days, and replaces on re-run", async () => {
    const days = hist(10).dates;
    await db.insert(schema.ingestLog).values(days.map((d) => ({ tradeDate: d, source: "bhavcopy", status: "ok", format: "udiff", rowCount: 1 })));
    await db.insert(schema.dailyPrices).values(days.map((d) => ({ tradeDate: d, symbol: "ABC", series: "EQ", open: 1, high: 1, low: 1, close: 1, prevClose: 1, volume: 10, turnover: 100 })));
    await db.insert(schema.indexConstituents).values({ indexKey: "total-market", symbol: "ABC", industry: "Capital Goods", fetchedOn: days.at(-1)! });
    await db.insert(schema.unusualDays).values({ tradeDate: days.at(-1)!, symbol: "ABC", kept: false, volume: true, jump: false, collapse: false, keptRatio: null, volumeRatio: 6, deliveryPct: null, usualDeliveryPct: null, changePct: 0, turnover: 100 });
    await computeVolumeLeaders();
    await computeVolumeLeaders();
    const rows = await db.select().from(schema.volumeLeaders);
    expect(rows).toHaveLength(5);
    expect(rows.find((r) => r.period === 5)).toMatchObject({ turnover: 500, unusualDays: 1, sessions: 5, asOf: days.at(-1) });
  });
});
```

- [ ] **Step 3: Run** `bun test tests/volume-leaders.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 4: Implement** `src/indicators/volume-leaders.ts`:

```ts
/** Top volume page: one stock's totals per rolling window (spec 2026-10-04). */
import type { History } from "./history";
import { segmentIds } from "./signals";

export const PERIODS = [1, 5, 21, 63, 126] as const;
export type Period = (typeof PERIODS)[number];
export type LeaderStat = { period: Period; turnover: number; shares: number; changePct: number | null; sessions: number };

/** Totals over each window [windowStarts[p], lastDay]; no row for a window the stock didn't trade in. */
export function leaderStats(h: History, windowStarts: Record<Period, string>, lastDay: string): LeaderStat[] {
  const seg = segmentIds(h.dates);
  const close = h.close.map((c, i) => c / h.factors[i]!);
  return PERIODS.flatMap((p) => {
    const from = windowStarts[p];
    const idx = h.dates.flatMap((d, i) => (d >= from && d <= lastDay ? [i] : []));
    if (idx.length === 0) return [];
    const first = idx[0]!, last = idx.at(-1)!;
    const before = first - 1;
    return [{
      period: p,
      turnover: idx.reduce((s, i) => s + h.turnover[i]!, 0),
      shares: idx.reduce((s, i) => s + h.volume[i]! * h.shareFactors[i]!, 0),
      changePct: before >= 0 && seg[before] === seg[last] ? (close[last]! / close[before]! - 1) * 100 : null,
      sessions: idx.length,
    }];
  });
}
```

`src/indicators/compute-volume-leaders.ts`:

```ts
/**
 * Rebuilds `volume_leaders` for every Nifty Total Market stock: totals over the
 * last 1/5/21/63/126 market sessions, through loadAdjustedHistory (renames,
 * splits). Replaced in one transaction, like unusual_days.
 */
import { eq, sql as dsql } from "drizzle-orm";
import { db, schema } from "../db";
import { loadAdjustedHistory, loadRenames } from "./history";
import { PERIODS, leaderStats, type Period } from "./volume-leaders";

export async function computeVolumeLeaders(opts: { symbols?: string[] } = {}): Promise<{ rows: number; asOf: string | null }> {
  const days = (await db.execute<{ d: string }>(dsql`
    select trade_date::text d from ingest_log where source = 'bhavcopy' and status = 'ok'
    order by trade_date desc limit 126`)).map((r) => r.d);
  if (days.length === 0) return { rows: 0, asOf: null };
  const asOf = days[0]!;
  const starts = Object.fromEntries(PERIODS.map((p) => [p, days[Math.min(p, days.length) - 1]!])) as Record<Period, string>;
  const symbols = opts.symbols ?? (await db.select({ s: schema.indexConstituents.symbol }).from(schema.indexConstituents)
    .where(eq(schema.indexConstituents.indexKey, "total-market"))).map((r) => r.s);
  const unusual = await db.execute<{ symbol: string; d: string }>(dsql`
    select symbol, trade_date::text d from unusual_days where trade_date >= ${starts[126]}`);
  const unusualBy = new Map<string, string[]>();
  for (const u of unusual) (unusualBy.get(u.symbol) ?? unusualBy.set(u.symbol, []).get(u.symbol)!).push(u.d);

  const renames = await loadRenames();
  const rows: (typeof schema.volumeLeaders.$inferInsert)[] = [];
  for (const symbol of symbols) {
    const h = await loadAdjustedHistory(symbol, renames);
    if (!h) continue;
    const u = unusualBy.get(symbol) ?? [];
    for (const s of leaderStats(h, starts, asOf)) {
      rows.push({ asOf, symbol, ...s, unusualDays: u.filter((d) => d >= starts[s.period] && d <= asOf).length });
    }
  }
  await db.transaction(async (tx) => {
    await tx.delete(schema.volumeLeaders);
    for (let i = 0; i < rows.length; i += 1000) await tx.insert(schema.volumeLeaders).values(rows.slice(i, i + 1000));
  });
  return { rows: rows.length, asOf };
}
```

Add `"volume-leaders": "bun run src/indicators/cli-volume-leaders.ts",` to `package.json` with `src/indicators/cli-volume-leaders.ts`:

```ts
/** Rebuilds the Top volume table. bun run volume-leaders */
import { sql } from "../db";
import { computeVolumeLeaders } from "./compute-volume-leaders";
const t0 = Date.now();
const r = await computeVolumeLeaders();
console.log(`[volume leaders] ${r.rows} rows as of ${r.asOf} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
await sql.end();
```

Nightly (after the unusual-activity block, before `sql.end()`):

```ts
try {
  const vl = await computeVolumeLeaders();
  console.log(`[nightly] top volume: ${vl.rows} rows as of ${vl.asOf}`);
} catch (e) {
  console.warn(`[nightly] WARNING top volume not rebuilt: ${e instanceof Error ? e.message : e}`);
}
```

- [ ] **Step 5: Run** `bun test tests/volume-leaders.test.ts && bunx tsc --noEmit` — PASS. Then `bun run volume-leaders` — Expected: ~3,750 rows (750 × 5), well under a minute.

- [ ] **Step 6: Spot check** one stock's 21-session turnover against SQL: `select sum(turnover) from daily_prices where symbol = 'HDFCBANK' and series = 'EQ' and trade_date >= <starts[21]>` equals `volume_leaders.turnover` for period 21.

- [ ] **Step 7: Commit** `git add src/db/schema.ts drizzle src/indicators/volume-leaders.ts src/indicators/compute-volume-leaders.ts src/indicators/cli-volume-leaders.ts src/ingest/cli-nightly.ts package.json tests/volume-leaders.test.ts && git commit -m "Top volume: nightly window totals per stock (volume_leaders)"`

---

### Task 3: The page's query

**Files:** Create `src/query/volume.ts`, `tests/volume-query.test.ts`.

**Interfaces — produces:**
- `type SizeGroup = "large" | "mid" | "small" | "micro"`; `type RankBy = "value" | "shares"`
- `type LeaderRow = { symbol: string; sector: string; size: SizeGroup | null; turnover: number; shares: number; changePct: number | null; sessions: number; unusualDays: number; hasCard: boolean }`
- `topVolume(o: { period: Period; rank: RankBy; size: SizeGroup | null; sector: string | null; indexKey: string | null }): Promise<{ asOf: string | null; rows: LeaderRow[] }>`
- `sectorsPresent(): Promise<string[]>`

- [ ] **Step 1: Failing tests** — `tests/volume-query.test.ts`:

```ts
import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { sectorsPresent, topVolume } from "../src/query/volume";

beforeEach(async () => {
  for (const t of [schema.volumeLeaders, schema.indexConstituents, schema.indexMembers]) await db.delete(t);
  const c = (indexKey: string, symbol: string, industry = "Financial Services") => ({ indexKey, symbol, industry, fetchedOn: "2026-10-01" });
  await db.insert(schema.indexConstituents).values([
    c("total-market", "BIGBANK"), c("total-market", "SMALLIT", "Information Technology"), c("total-market", "MIDBANK"),
    c("nifty-100", "BIGBANK"), c("smallcap-250", "SMALLIT"), c("midcap-150", "MIDBANK"), c("bank", "BIGBANK"), c("bank", "MIDBANK"),
  ]);
  const v = (symbol: string, turnover: number, shares: number) => ({ asOf: "2026-10-01", symbol, period: 21, turnover, shares, changePct: 1, sessions: 21, unusualDays: 0 });
  await db.insert(schema.volumeLeaders).values([v("BIGBANK", 900, 10), v("SMALLIT", 100, 500), v("MIDBANK", 300, 50)]);
  await db.insert(schema.indexMembers).values({ indexName: "NIFTY50", symbol: "BIGBANK", addedOn: "2020-01-01", removedOn: null });
});
const base = { period: 21 as const, rank: "value" as const, size: null, sector: null, indexKey: null };

describe("topVolume", () => {
  test("ranks by ₹ value, or by shares", async () => {
    expect((await topVolume(base)).rows.map((r) => r.symbol)).toEqual(["BIGBANK", "MIDBANK", "SMALLIT"]);
    expect((await topVolume({ ...base, rank: "shares" })).rows.map((r) => r.symbol)).toEqual(["SMALLIT", "MIDBANK", "BIGBANK"]);
  });
  test("size, sector and index filters, alone and together", async () => {
    expect((await topVolume({ ...base, size: "small" })).rows.map((r) => r.symbol)).toEqual(["SMALLIT"]);
    expect((await topVolume({ ...base, sector: "Financial Services" })).rows.map((r) => r.symbol)).toEqual(["BIGBANK", "MIDBANK"]);
    expect((await topVolume({ ...base, indexKey: "bank", size: "mid" })).rows.map((r) => r.symbol)).toEqual(["MIDBANK"]);
  });
  test("carries sector, size and the Report Card link", async () => {
    const big = (await topVolume(base)).rows[0]!;
    expect(big).toMatchObject({ sector: "Financial Services", size: "large", hasCard: true });
    expect((await topVolume(base)).asOf).toBe("2026-10-01");
  });
  test("sectors present in the universe", async () => {
    expect(await sectorsPresent()).toEqual(["Financial Services", "Information Technology"]);
  });
});
```

- [ ] **Step 2: Run** — FAIL (module missing).

- [ ] **Step 3: Implement** `src/query/volume.ts`:

```ts
/** The Top volume page reads volume_leaders joined with today's NSE index lists (spec 2026-10-04). */
import { sql } from "drizzle-orm";
import { db } from "../db";
import type { Period } from "../indicators/volume-leaders";
import { INDEX_NAME } from "../ingest/nifty50";
import { SIZE_KEYS, UNIVERSE_KEY } from "../ingest/index-constituents";

export type SizeGroup = keyof typeof SIZE_KEYS;
export type RankBy = "value" | "shares";
export type LeaderRow = {
  symbol: string; sector: string; size: SizeGroup | null; turnover: number; shares: number;
  changePct: number | null; sessions: number; unusualDays: number; hasCard: boolean;
};

export async function topVolume(o: { period: Period; rank: RankBy; size: SizeGroup | null; sector: string | null; indexKey: string | null }) {
  const rows = await db.execute<{
    symbol: string; sector: string; size: SizeGroup | null; turnover: number; shares: number; change_pct: number | null;
    sessions: number; unusual_days: number; has_card: boolean; as_of: string;
  }>(sql`
    select v.symbol, u.industry as sector,
           case when exists (select 1 from index_constituents s where s.index_key = ${SIZE_KEYS.large} and s.symbol = v.symbol) then 'large'
                when exists (select 1 from index_constituents s where s.index_key = ${SIZE_KEYS.mid} and s.symbol = v.symbol) then 'mid'
                when exists (select 1 from index_constituents s where s.index_key = ${SIZE_KEYS.small} and s.symbol = v.symbol) then 'small'
                when exists (select 1 from index_constituents s where s.index_key = ${SIZE_KEYS.micro} and s.symbol = v.symbol) then 'micro' end as size,
           v.turnover, v.shares, v.change_pct, v.sessions, v.unusual_days, v.as_of::text as as_of,
           exists (select 1 from index_members m where m.index_name = ${INDEX_NAME} and m.symbol = v.symbol) as has_card
    from volume_leaders v
    join index_constituents u on u.index_key = ${UNIVERSE_KEY} and u.symbol = v.symbol
    where v.period = ${o.period}
      ${o.sector ? sql`and u.industry = ${o.sector}` : sql``}
      ${o.indexKey ? sql`and exists (select 1 from index_constituents f where f.index_key = ${o.indexKey} and f.symbol = v.symbol)` : sql``}`);
  const out = rows
    .map((r) => ({
      symbol: r.symbol, sector: r.sector, size: r.size, turnover: Number(r.turnover), shares: Number(r.shares),
      changePct: r.change_pct === null ? null : Number(r.change_pct), sessions: Number(r.sessions),
      unusualDays: Number(r.unusual_days), hasCard: r.has_card,
    }))
    .filter((r) => o.size === null || r.size === o.size)
    .sort((a, b) => (o.rank === "value" ? b.turnover - a.turnover : b.shares - a.shares) || a.symbol.localeCompare(b.symbol));
  return { asOf: rows[0]?.as_of ?? null, rows: out };
}

export async function sectorsPresent(): Promise<string[]> {
  const r = await db.execute<{ industry: string }>(sql`
    select distinct industry from index_constituents where index_key = ${UNIVERSE_KEY} and industry <> '' order by 1`);
  return r.map((x) => x.industry);
}
```

`asOf` when the filter leaves no rows: also read `select max(as_of) from volume_leaders` so the header still shows a date — add `const [a] = await db.execute<{ d: string | null }>(sql\`select max(as_of)::text d from volume_leaders\`)` and return `asOf: a?.d ?? null` instead of `rows[0]?.as_of`.

- [ ] **Step 4: Run** `bun test tests/volume-query.test.ts && bunx tsc --noEmit` — PASS.

- [ ] **Step 5: Commit** `git add src/query/volume.ts tests/volume-query.test.ts && git commit -m "Top volume query: rank by value or shares, size/sector/index filters"`

---

### Task 4: Glossary, navigation, share formatting

**Files:** Modify `src/lib/glossary.ts`, `src/lib/format.ts`, `src/components/SiteNav.tsx`, `src/components/hotkey-target.ts`, `src/query/glossary-live.ts`; tests `tests/hotkeys.test.ts`, `tests/format.test.ts`, `tests/glossary.test.ts`.

- [ ] **Step 1: Failing tests:**
  - hotkeys: `expect(hotkeyTarget("v", { page: "screener", ma: "sma200" })).toBe("/volume?ma=sma200"); expect(hotkeyTarget("1", { page: "volume", ma: "sma200" })).toBeNull();`
  - format: `expect(formatShares(1.234e7)).toBe("1.23 cr"); expect(formatShares(45_600)).toBe("45,600"); expect(formatShares(5.5e5)).toBe("5.50 lakh");`
  - glossary "covers the terms on screen": `for (const id of ["top-volume", "value-traded", "size-group", "nse-sector"]) expect(isTermId(id)).toBe(true);`
- [ ] **Step 2: Run** — 3 FAIL.
- [ ] **Step 3: Implement:**
  - `formatShares(n)`: ≥ 1e7 → `${(n/1e7).toFixed(2)} cr`; ≥ 1e5 → `${(n/1e5).toFixed(2)} lakh`; else `Math.round(n).toLocaleString("en-IN")`.
  - hotkey-target: `volume: "/volume"` in BASE; `if (key === "v") return \`/volume?ma=${c.ma}\`;`; add `c.page === "volume"` to the 1–3 null list.
  - SiteNav: `Section` gains `"volume"`; Stocks group after activity: `{ key: "volume", href: "/volume", label: "Top volume", short: "Volume", hint: "v", icon: BarChart3 }` (import `BarChart3`); SHORTCUTS `"b a c s u v r g l"`.
  - glossary: ids after `"delivery-collapse"`, entries (topic "Stocks", short ≤ 220, true minus, facts only):
    - `top-volume` "Top volume": stocks ranked by how much was traded over a period (₹ value or shares), among the ~750 Nifty Total Market stocks; where money moved, not where prices go next. related: value-traded, size-group, nse-sector; seeIt /volume.
    - `value-traded` "₹ value traded": rupees that changed hands (price × shares, NSE's turnover), summed over the period; fair across cheap and expensive stocks; example with two stocks. related: top-volume, volume-ratio.
    - `size-group` "Size group": Large = Nifty 100, Mid = Midcap 150, Small = Smallcap 250, Micro = Microcap 250 (NSE's lists, by company value, reviewed twice a year). related: nse-sector, top-volume.
    - `nse-sector` "Sector (NSE)": NSE's industry for each company in its index files (e.g. Financial Services, Capital Goods); 22 sectors. related: size-group, top-volume.
  - glossary-live: a case for the four ids: `top-volume` → "{top symbol} led on ₹ value traded over the last month ({₹ cr})." from `volume_leaders` period 21 joined to the universe; the other three → null.
- [ ] **Step 4: Run** `bun test tests/hotkeys.test.ts tests/format.test.ts tests/glossary.test.ts tests/glossary-live.test.ts && bunx tsc --noEmit` — PASS (add `schema.volumeLeaders, schema.indexConstituents` to glossary-live's `empty()` list).
- [ ] **Step 5: Commit** `git add src/lib src/components/SiteNav.tsx src/components/hotkey-target.ts src/query/glossary-live.ts tests && git commit -m "Top volume: glossary, sidebar entry, v shortcut, share format"`

---

### Task 5: The page

**Files:** Create `src/app/volume/page.tsx`, `src/components/VolumeTable.tsx`.

- [ ] **Step 1: `src/components/VolumeTable.tsx`** (server component): columns `#`, Stock (links to `/stock/X` when `hasCard`), Sector (hidden below md), Size (badge neutral; hidden below sm), ₹ traded (`formatCrore`), Shares (`formatShares`; hidden below sm), Price (signed %, `text-up`/`text-down`, "—" when null), Unusual days (count linking to `/activity?date=…` is not possible per-stock; show the number, hidden below md). A row with `sessions < period` shows "12 of 21 sessions" in muted text under the symbol. Sticky header, `max-h-[560px] overflow-auto`, density tokens (`h-row-head`, `py-cell`, `px-card-x`, `text-body-sm`), `tabular-nums`. Empty state text passed in.
- [ ] **Step 2: `src/app/volume/page.tsx`**: validate params with strict comparisons — `period` ∈ {"1","5","21","63","126"} (default "21"), `rank` ∈ {"value","shares"} (default "value"), `size` ∈ {"large","mid","small","micro"} or null, `sector` ∈ `await sectorsPresent()` or null, `index` ∈ `INDEX_LISTS` keys excluding `total-market` or null, `ma` via `isMaKind`. Fetch `topVolume`. Layout: `AppShell current="volume"`, `PageHeader` eyebrow "Nifty Total Market · Stocks", title "Top volume", description "The most-traded stocks over the period, by rupees or by shares. Heavy trading shows where money moved, not where prices go next."; a card with: period tabs (seg/`SlidingPill` like Screener), rank switch, size chips (thumb style), sector `<select>` and index `<select>` inside a GET `<form>` with a "Show" submit button (no client JS) keeping the other params as hidden inputs; heading "{n} stocks · {period label} to {formatDate(asOf)}" with `<Term id="top-volume">`; `VolumeTable`; footer: "Index members as of today, from NSE's lists. Shares are adjusted for splits and bonuses." Empty state when no `asOf`: "Run `bun run ingest:index-lists` then `bun run volume-leaders`."
- [ ] **Step 3: Typecheck + full suite** `bunx tsc --noEmit && bun test` — PASS.
- [ ] **Step 4: Browser check** on `bun run dev -- -p 3100` (never :3000): `/volume`, each period, rank=shares, size=micro, a sector, index=bank, `index=nonsense` (falls back), combined filters with no match (empty state). Headless screenshots in dark, light, phone width (`.ds-sync` Playwright, run from the repo root). Fix what's off; stop the dev server.
- [ ] **Step 5: Commit** `git add src/app/volume src/components/VolumeTable.tsx && git commit -m "Top volume page"`

---

### Task 6: Docs, review, live

- [ ] **Step 1:** Decision 0025 (universe and filters from NSE's index lists, 43 verified files and the ones not found, today-only membership, nightly tables, ranking by value or shares, rolling windows); `docs/decisions/README.md` row; `docs/pipelines.md` (pipelines 13 index lists, 14 top volume, nightly order); README (page, schema, function reference, commands); CLAUDE.md (page list, commands); TODO (Data to add: mark the leaderboard done; note AMFI not needed).
- [ ] **Step 2:** `bun test && bunx tsc --noEmit` — PASS. Commit.
- [ ] **Step 3:** Final whole-branch review (fresh reviewer), fix pass, merge to main, `bun run build`, restart :3000 detached, confirm `/volume` 200, run the launchd nightly once and read its log.
