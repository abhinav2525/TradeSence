# Nifty Bank and Nifty Financial Services Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The NIFTY 50 features for Nifty Bank and Nifty Financial Services on true day-by-day membership since 2020: step A (data + Breadth, Advance/Decline, Crossings, Screener, Unusual activity), step B (Report Card for every member, Signals as episodes).

**Architecture:** An index registry (`src/ingest/indices.ts`) binds each index's page key, membership name, NSE price-index name, list key, label, membership file and expected member count by date. The existing membership loader, compute, queries and pages are generalised to read from it; nothing changes for NIFTY 50 numbers.

**Tech Stack:** Bun, TypeScript, Drizzle/Postgres, Next.js 16.

**Spec:** `docs/superpowers/specs/2026-10-05-bank-finservice-indices-design.md` (approved 2026-10-05 with the advisors' changes)

## Global Constraints

- One parameter `u` with keys `nifty50` (default), `bank`, `financial-services`; one shared strict check; cross-page hotkeys do NOT keep it (owner).
- Membership reload from a file: standing rule with guards (that index only, one transaction, refuse a shrink without `--force`, manual only); nothing else deletes.
- Report Card market line = NIFTY 50 always; the chosen index only for the peer rank (owner).
- Signals for these indices: episode rows only, no medians; the "never tested on this index" line; no retuning.
- "x of N counted" wording; no "rare"/percentile wording for these indices.
- Compute once over the union of all registered indices' members; the step wrapped in try/catch.
- Tests from the repo root; TDD; every new on-screen term in the glossary.

## Review Focus

- A stock that left Nifty Bank mid-window must count only before it left, on every page.
- A stock in both indices and the NIFTY 50 (e.g. HDFCBANK) is computed once; its NIFTY 50 rows are byte-identical before/after.
- `u=private-bank` (a list with no membership file) must still show today's-list breadth, never a crash or an empty point-in-time result.
- The Bank file loaded under the wrong index name must be impossible (registry binds them); a refused file leaves stored rows intact.
- `has_card` for a Bank-only stock on Unusual activity and Top volume.

---

## Step A

### Task A1: Index registry and generalised membership loader
**Files:** create `src/ingest/indices.ts`; modify `src/ingest/nifty50-history.ts` (generalise `validateMembershipHistory`/`loadNifty50History` to take a registry entry; keep the old names as thin wrappers), `src/ingest/cli-nifty50.ts` (or a new `cli-members.ts <key> [--force]`); tests `tests/indices.test.ts`, `tests/nifty50-history.test.ts`.
- [ ] Failing tests: registry has unique keys and names that exist in `INDEX_LISTS` and NSE's index names; the validator accepts a file whose counts follow a dated size schedule (12 then 14 from the announced date) and refuses a gap, an overlap, a wrong count before and after the change; the NIFTY 50 file still yields exactly today's rows; loading one index leaves the others' rows untouched; a reload that would shrink is refused without `--force`.
- [ ] Implement; commit.

### Task A2: Membership files (hand-kept, from NSE Indices press releases)
**Files:** create `src/ingest/niftybank-history.csv`, `src/ingest/niftyfinservice-history.csv`; tests `tests/niftybank-history.test.ts`, `tests/niftyfinservice-history.test.ts` (live drift vs `index_constituents` rows, and the schedule).
- [ ] Reconstruct from the semi-annual announcements since 2019-09 plus any ad-hoc changes (mergers, the Bank size change). Every row cites its PDF. Check: the file's members on each announcement date match the PDF; today's members match NSE's list.
- [ ] Load both; spot-check breadth on a known rebalance day; commit.

### Task A3: Compute once, drift check, nightly
**Files:** `src/indicators/compute.ts` (symbols = union over registered indices), `src/ingest/cli-nightly.ts` (try/catch; drift check for all registered files against `index_constituents`; a "file differs from database" warning), `docs/pipelines.md`.
- [ ] Failing tests: union is computed once per symbol; NIFTY 50 rows unchanged (compare a sample before/after); the drift helper reports added/removed per index.
- [ ] Implement; run `bun run indicators`; commit.

### Task A4: The five pages
**Files:** `src/indicators/breadth-universes.ts` (`cleanUniverse` already; add `pointInTime(u)` → registry entry or null), `src/query/breadth.ts` (route `bank`/`financial-services` to point-in-time), `advance-decline.ts`, `crossings.ts`, `screener.ts`, `activity.ts` (index name parameter; `has_card` over all registered indices), `volume.ts` (`has_card`), pages (`u` carried by `MaTabs`/`DateNav`/links; an index segmented control component shared by the pages; wording "x of N"), `hotkey-target.ts` unchanged (owner).
- [ ] Failing tests per query with a member that left mid-window; `cleanUniverse` unchanged; `pointInTime`.
- [ ] Implement; screenshots wide/phone for each page; commit.

### Task A5: Docs for step A
- [ ] Decision 0034 (what, options, the four owner decisions, the quant's numbers, checks); README; CLAUDE.md membership paragraph (three files); pipelines; folder guides; glossary; TODO. Commit. Independent review; fix pass; merge; rebuild :3000.

## Step B (after A is live)

### Task B1: Report Card for every member
- `supportedStocks` lists all registered indices' members; `stockReport(symbol, peersIndex)`: peers = that index's members on the date; market comparisons stay NIFTY 50 and the page says so; the audit covers every (stock, index) card; time before/after.

### Task B2: Signals as episodes
- `signalsData(indexName)` on the index's own close; the page renders episode rows only for non-NIFTY-50 indices, with the "never tested on this index" line and "x of N" wording; no medians.

### Task B3: Docs, review, merge.
