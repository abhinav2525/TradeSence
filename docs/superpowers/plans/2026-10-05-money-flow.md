# Money flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/money-flow` page showing, per NSE sector, ₹ traded against its own 3-month normal for 1 day / 1 week / 1 month, the direction its stocks moved, its share of all trading, and the stocks driving it; rebuilt nightly.

**Architecture:** Pure maths in `src/indicators/money-flow.ts` (`flowStats` per stock, `sectorFlows` and `sectorStocks` per sector). `computeMoneyFlow` writes per-stock rows into a new `money_flow` table nightly (same pattern as `volume_leaders`). The page reads the rows through `src/query/money-flow.ts` and aggregates with the same pure functions.

**Tech Stack:** Bun, TypeScript, Drizzle/Postgres, Next.js 16 App Router, Tailwind v4 tokens.

**Spec:** `docs/superpowers/specs/2026-10-05-money-flow-design.md`

## Global Constraints

- Universe: `index_constituents` `index_key = 'total-market'`, sector = `industry`; histories via `loadAdjustedHistory(symbol, renames, { series: ["EQ", "BE"] })`.
- `FLOW_PERIODS = [1, 5, 21]`; `NORMAL_SESSIONS = 63` before the window; `MIN_NORMAL = 40` sessions traded; `MIN_SECTOR_STOCKS = 5`; drill-down top 25.
- Move over the window on adjusted closes; null across a step over `MAX_MOVE_GAP_DAYS` or if the stock didn't trade on the latest session (as `leaderStats`).
- Never compare computed numbers exactly: direction uses `NOISE_PCT`.
- Every URL param strictly checked with a default; `sector` accepted only if present in the table.
- Tokens and density tokens only; bars use `grow-x`; every new term in `glossary.ts` with `<Term>`; `<Term>` never inside a link.
- Tests from the repo root; TDD.

## Review Focus

- A stock with no normal (new listing): counted in turnover share? → in share of trading yes (it is real money), in the ratio no; test both.
- A sector whose stocks all lack a normal: ratio null, sector still listed? → listed at the bottom with "—", never NaN/Infinity.
- Fewer than 63 + 21 sessions in the database (fresh install): compute returns 0 rows, page shows "Nothing loaded".
- `?sector=` with an unknown or encoded value: ignored, never reaches SQL.
- A stock that traded only on some days of the window: turnover sums what it traded; normal × P still uses P sessions (absence = less money, which is the point).

---

### Task 1: Pure maths

**Files:** Create `src/indicators/money-flow.ts`, `tests/money-flow.test.ts`.

**Interfaces — produces:**
- `FLOW_PERIODS`, `FlowPeriod`, `NORMAL_SESSIONS`, `MIN_NORMAL`, `MIN_SECTOR_STOCKS`
- `type FlowWindows = { asOf: string; starts: Record<FlowPeriod, string>; normalFrom: Record<FlowPeriod, string>; normalTo: Record<FlowPeriod, string> }`
- `flowWindows(days: string[] /* newest first */): FlowWindows | null`
- `type FlowStat = { period: FlowPeriod; turnover: number; normalDaily: number | null; sessions: number; changePct: number | null }`
- `flowStats(h: History, w: FlowWindows): FlowStat[]`
- `type FlowRow = { symbol: string; sector: string; turnover: number; normalDaily: number | null; changePct: number | null }`
- `type SectorFlow = { sector: string; stocks: number; ratio: number | null; share: number; usualShare: number | null; medianMove: number | null; up: number; down: number }`
- `sectorFlows(rows: FlowRow[], period: FlowPeriod): { sectors: SectorFlow[]; small: string[] }`
- `sectorStocks(rows: FlowRow[], sector: string, period: FlowPeriod, limit = 25): (FlowRow & { extra: number | null; ratio: number | null })[]`

- [ ] **Step 1: failing tests** (`tests/money-flow.test.ts`): windows (period 5 with 100 days: starts = days[4], normal = days[5]..days[67]); `flowWindows` null with fewer than 21 + 63 days; `flowStats` on a hand-built History (normal window never overlaps; 39 traded normal sessions → `normalDaily` null; 40 → mean; missing latest day → `changePct` null; a split factor doesn't change turnover); `sectorFlows` on hand rows (ratio = Σturnover ÷ Σ(normalDaily×P) over stocks with a normal; share over all stocks; usualShare from normals; median move and up/down counts with NOISE_PCT; sector with 4 stocks → `small`; all-null-normal sector → ratio null; sorted by ratio desc, nulls last); `sectorStocks` sorted by extra ₹ desc, limit honoured.
- [ ] **Step 2:** run → FAIL (module missing).
- [ ] **Step 3:** implement (windows from the newest-first session list: `starts[p] = days[p-1]`, `normalTo[p] = days[p]`, `normalFrom[p] = days[p + NORMAL_SESSIONS - 1]`).
- [ ] **Step 4:** run → PASS; `bunx tsc --noEmit`.
- [ ] **Step 5:** commit "Money flow: per-stock and per-sector maths".

### Task 2: Table, nightly build, command

**Files:** Modify `src/db/schema.ts` (+ generated migration); create `src/indicators/compute-money-flow.ts`, `src/indicators/cli-money-flow.ts`, `tests/money-flow-compute.test.ts`; modify `src/ingest/cli-nightly.ts`, `package.json` (`"money-flow"`), `docs/pipelines.md`.

- [ ] **Step 1: failing test** (test DB): seed 90 sessions of `ingest_log` + `daily_prices` for two stocks in `index_constituents` total-market (one renamed via `symbol_changes`, its first 60 days under the old symbol); `computeMoneyFlow()` writes 3 rows per stock, the renamed stock's `normal_daily` includes old-symbol days; a second run replaces, not appends.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** schema `money_flow` (as_of date, symbol, sector, period int, turnover double, normal_daily double null, sessions int, change_pct double null; PK (symbol, period)); `bun run db:generate && bun run db:migrate` (also on `tradesence_test` as the other migrations are applied); `computeMoneyFlow` (sessions from `ingest_log` newest-first, limit 21 + 63; symbols + industry from `index_constituents`; one transaction delete + insert in chunks of 1000).
- [ ] **Step 4:** run → PASS; nightly step after Top volume with its own try/catch warning; CLI; pipelines.md row + section 15.
- [ ] **Step 5:** `bun run money-flow` on the dev DB; spot check one sector's ratio by SQL; commit.

### Task 3: The page

**Files:** Create `src/query/money-flow.ts`, `src/app/money-flow/page.tsx`, `src/components/FlowBars.tsx`, `src/components/FlowStocks.tsx`; modify `src/components/SiteNav.tsx` (Section + link "Money flow", hint `m`, under Stocks), `src/components/hotkey-target.ts` (`money-flow` base, `m`, 1–3 do nothing), `src/lib/glossary.ts` (+ `money-flow`, `trading-vs-normal`, `share-of-trading`), `src/query/glossary-live.ts`, tests (`hotkeys`, `glossary`, `motion` file list adds `FlowBars`).

- [ ] **Step 1: failing tests:** hotkey `m` → `/money-flow?ma=…`; 1–3 null on money-flow; glossary ids exist; motion test includes FlowBars; `cleanFlowPeriod` ("1"→1, "21"→21, else 5).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement: query reads rows + as_of; page (`force-dynamic`, `isMaKind`, period switch with `SlidingPill`, sector checked against the rows' sectors, main card with `FlowBars`, drill-down card with `FlowStocks`, "Nothing loaded" card, footer naming small sectors); bars: track with a 1× tick, width scaled to the max ratio, `grow-x`, colour `bg-up`/`bg-down`/`bg-muted` by median move; each row a link (no `<Term>` inside).
- [ ] **Step 4:** tests PASS; `bunx tsc --noEmit`; full `bun test`; headless screenshots on `next dev -p 3100` (wide dark, phone light), one look, one edit pass.
- [ ] **Step 5:** commit.

### Task 4: Docs

- [ ] Decision 0028 (problem, options, decision, why) + README row; README function reference + command; CLAUDE.md commands + page list; TODO (history chart later). Commit.
