# Breadth universes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Breadth for the whole liquid market (history since 2016) and every NSE index list (today, saved nightly), selectable on the Breadth page; NIFTY 50 unchanged.

**Architecture:** `adjustedAverages(h)` (shared with `compute.ts`) and a pure counter in `src/indicators/breadth-universes.ts`; `computeBreadth()` upserts `breadth_daily`; the page reads it per universe.

**Tech Stack:** Bun, TypeScript, Drizzle/Postgres, Next.js 16.

**Spec:** `docs/superpowers/specs/2026-10-05-breadth-universes-design.md`

## Global Constraints

- No deletes in the database from this feature: upserts only; migration only creates.
- Averages identical to `compute.ts` (one shared function).
- `u` param strictly checked; NIFTY 50 code path unchanged.
- Tokens/density tokens; `<Term>` never inside a link; tests from the repo root.

## Review Focus

- `compute.ts` refactor must leave `daily_indicators` values byte-identical (existing tests + a live diff on a few symbols).
- A universe with no rows yet (index lists before the first nightly run): "Nothing loaded" card, not a crash.
- Fewer than 20 sessions of history: percentile shown as "history building", no misleading "rare" badges.
- Old links (`/?ma=…&date=…`, no `u`) behave exactly as before.
- A stock in an index list with no prices: not counted, no error.

---

### Task 1: Shared averages and the counter
- [ ] Tests: `adjustedAverages` on a hand series (segment restart across a 30-day gap; values equal `sma`/`ema` of adjusted closes); counter: per-day above/total for three averages, null averages skipped, `include` mask honoured, `latestOnly` counts only the last date.
- [ ] Implement `adjustedAverages` (in `src/indicators/compute.ts`'s neighbour `moving-average.ts`? no: new `src/indicators/averages.ts`), refactor `compute.ts` to use it; counter in `breadth-universes.ts`. Existing compute tests stay green. Commit.

### Task 2: Table and nightly build
- [ ] Failing compute test (test DB): two liquid companies + one illiquid + an index list → `breadth_daily` rows for `market` on every day with an average, the list on the latest day only; re-run gives the same rows (upsert), no duplicates.
- [ ] Schema + migration (create only; check the SQL); `computeBreadth`; CLI `bun run breadth`; nightly step (own try/catch); ANALYZE list; pipelines.md.
- [ ] Cross-check script: engine on NIFTY 50 point-in-time vs `breadthSeries` (latest 5 days, 3 averages). Live run. Commit.

### Task 3: The page
- [ ] Tests: `cleanUniverse`; hotkey/ma links keep `u` (if touched); glossary id.
- [ ] Query `universeSeries(u, ma)`; page branches; hero/tiles wording props; selector form; screenshots; full suite. Commit.

### Task 4: Docs, review, merge
- [ ] Decision 0030 + README row, README, CLAUDE.md, folder guides, TODO. Independent review; fix pass; merge; rebuild :3000; nightly by hand.
