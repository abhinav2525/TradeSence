# Money flow history Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 12-month weekly line of each sector's trading vs normal on `/money-flow`, stored in properly keyed nightly tables, with the per-view short-session aggregation moved to the nightly job and planner statistics kept current.

**Architecture:** Pure `weekWindows` + `weeklySectorFlows` + `marketTotals` in `src/indicators/money-flow.ts`; `computeMoneyFlow` fills `money_flow`, `sector_flow_weeks` and `short_sessions` from the histories it already loads, in one transaction; the page reads the two new tables by key.

**Tech Stack:** Bun, TypeScript, Drizzle/Postgres, Next.js 16, Recharts via `ui/chart`.

**Spec:** `docs/superpowers/specs/2026-10-05-money-flow-history-design.md`

## Global Constraints

- `HISTORY_WEEKS = 52`, week = 5 sessions, normal = 63 sessions after it (older), ≥ 40 traded; week 0 ≡ `flowWindows` period 5.
- Sector maths only through `sectorFlows(rows, 5)`; sectors under 5 stocks not stored.
- Keys: `sector_flow_weeks` PK (sector, week_end); `short_sessions` PK trade_date; `money_flow` PK (period, symbol).
- No per-view aggregation of `daily_prices`; `ANALYZE` the rebuilt tables nightly.
- Charts spread `useChartAnimation()`; height `h-[calc(Npx*var(--density-chart))]`; tokens only.

## Review Focus

- A sector that had fewer than 5 stocks with data in an early week: still stored if it has ≥ 5 listed stocks? → stored by listed count (as the bars), ratio null when nothing qualifies, never NaN.
- History shorter than 52 weeks + 63 sessions: only weeks with a full normal window are written.
- The page with a picked sector but no history rows: card shows a plain "No history yet" line, not an empty chart.
- Migration changing a primary key on a populated table: must apply cleanly on both databases.
- The nightly ANALYZE failing must not fail the nightly run.

---

### Task 1: Pure weekly maths

**Files:** `src/indicators/money-flow.ts`, `tests/money-flow.test.ts`.

**Produces:** `HISTORY_WEEKS`; `type WeekWindow = { end: string; start: string; normalFrom: string; normalTo: string }`; `weekWindows(days: string[] /* newest first */, weeks = HISTORY_WEEKS): WeekWindow[]` (only weeks with a full normal, newest first); `weekStats(h, wk: WeekWindow): FlowStat | null` (period 5); `type SectorWeek = { weekEnd: string; sector: string; ratio: number | null; medianMove: number | null; stocks: number; shortSession: boolean }`; `weeklySectorFlows(stocks: { symbol; sector; h }[], weeks: WeekWindow[], short: Set<string>): SectorWeek[]`; `marketTotals(histories: History[], from: string): { date: string; turnover: number }[]` (oldest first).

- [ ] Failing tests: week 0 windows equal `flowWindows(days).starts[5]/normalFrom[5]/normalTo[5]`; consecutive weeks don't overlap; 52 weeks need 52×5+63 sessions, fewer → fewer weeks; `weeklySectorFlows` week 0 ratio equals `sectorFlows` on `flowStats` rows for period 5; a short session inside a week marks it; `marketTotals` sums per date.
- [ ] Implement; tests pass; tsc; commit.

### Task 2: Tables, nightly build, statistics

**Files:** `src/db/schema.ts` (+ migration), `src/indicators/compute-money-flow.ts`, `src/ingest/cli-nightly.ts`, `src/query/money-flow.ts`, `tests/money-flow-compute.test.ts`, `docs/pipelines.md`.

- [ ] Failing compute test: with 400 seeded sessions, `computeMoneyFlow` writes `sector_flow_weeks` (5-stock sector, 52 weeks), `short_sessions` (a seeded low day flagged), re-run replaces.
- [ ] Schema: two tables + `money_flow` PK (period, symbol); generate + migrate both DBs; check the generated SQL drops/recreates the PK only.
- [ ] Compute: sessions limit 52×5+63+63 (the extra 63 lets `shortSessions` judge the oldest week); build the three row sets in the existing loop; one transaction; then `ANALYZE money_flow, sector_flow_weeks, short_sessions` (own try/catch in nightly).
- [ ] Query: `shortSessionsIn(period)` reads `short_sessions`; new `sectorHistory(sector)` reads `sector_flow_weeks` ordered by week.
- [ ] One-off `ANALYZE` of the whole database; record EXPLAIN before/after for the page reads.
- [ ] Tests pass; `bun run money-flow`; live check week 0 = 1-week bar; commit.

### Task 3: The chart

**Files:** `src/components/FlowHistoryChart.tsx`, `src/app/money-flow/page.tsx`, `tests/motion.test.ts` if needed.

- [ ] Card above the stock list when a sector is picked (and history exists); else "No history yet".
- [ ] Screenshots wide + phone; full `bun test`; commit.

### Task 4: Docs

- [ ] Decision 0029 (history, keys, statistics, before/after plans) + README row; README; CLAUDE.md; pipelines; folder guides; TODO tick. Commit.
