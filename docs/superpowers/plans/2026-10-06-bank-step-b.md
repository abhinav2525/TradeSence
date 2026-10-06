# Nifty Bank step B (Report Cards for every member, Signals as episodes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Step B of `docs/superpowers/plans/2026-10-05-bank-finservice-indices.md` (its Tasks B1–B3,
expanded here so each task has exact files and tests): a Report Card for every member of every
registered index, and Signals for Nifty Bank as a list of washout episodes.

**Spec:** `docs/superpowers/specs/2026-10-05-bank-finservice-indices-design.md` (approved
2026-10-05, advisors' changes 9–11 folded in). Step A: decision 0034.

## Global Constraints (from the spec and the owner)

- The **NIFTY 50 stays the "market"** for every Report Card risk light (beta, Bad days, In
  crashes, market capture, crash episodes, bumpiness and worst-fall comparisons). The chosen index
  is used **only for the peer rank**, and the page says so.
- A Bank-only stock gets a card; a stock in both indices: peers = NIFTY 50 by default, `?u=bank`
  switches the peer set. Existing NIFTY 50 card URLs unchanged. `u` is checked strictly (a key the
  stock belongs to, else its default).
- "x of N" wording for Nifty Bank; no "rare" or percentile wording there.
- Signals for a non-NIFTY-50 index: episode rows only (washouts, index's own close 1/3/6 months
  on), no medians, no "higher in x of y", plus the line "Same 20% line as the NIFTY 50 alarm;
  never tested on this index; several episodes are the same sell-off." No retuning of the 20%
  line, the 10-session merge or the watch band. The Breadth washout notice stays NIFTY 50 only.
- Cross-page hotkeys do not keep the index (owner).
- The audit recalculates every (stock, peer index) card independently; 0 mismatches; time it
  before and after. A new Report Card number goes into the audit in the same change.
- TDD; tests from the repo root; every new on-screen term in the glossary; tokens only.

## Review Focus

- A NIFTY 50 stock's card (no `u`) is number-for-number what it was before (the audit's
  NIFTY 50 pass proves it).
- A Bank-only stock's risk lights are measured against the NIFTY 50, not Nifty Bank.
- `?u=bank` on a stock never in Nifty Bank, or `?u=junk`, falls back to the default peer set.
- A former Bank member's peer rank uses the members on the shown date.
- Signals `?u=bank`: no median or "x of y higher" anywhere on the page; the NIFTY 50 view unchanged.
- `has_card` true for a Bank-only stock on Unusual activity, Top volume and Money flow.

---

### Task 1: Report Cards for every registered index's members

**Files:** `src/query/stock-report.ts` (`supportedStocks` over every registered index with
`currentIn`; `stockReport(symbol, date?, peersKey?)`: membership found across all indices, peer
index = `peersKey` if the stock was ever in it else its first registered index; crash breadth and
the market line stay NIFTY 50; report gains `peerIndex`, `indices`, `strength.below`);
`src/indicators/risk.ts` (`rankAmongPeers` also returns `below`); `src/query/card-indices.ts`
(new: the "any registered index" SQL list); `src/query/activity.ts`, `volume.ts`,
`money-flow.ts` (`has_card` / `withReportCard` over every registered index);
`src/components/StockChecks.tsx` (Strength sentence names the peer index; "9 of 13" for a
non-NIFTY-50 peer set); `src/app/stock/[symbol]/page.tsx` (peer switch for a stock in two
indices, `u` carried by date nav and arrows, eyebrow and membership line name the index, the
"market = NIFTY 50" line); `src/app/stock/page.tsx` + `StockList.tsx` (a "Nifty Bank only" group);
`src/audit/report-card.ts` (every registered index's members on the date, each with its peers).
**Tests:** `tests/stock-report.test.ts`, `tests/activity-query.test.ts`, `tests/volume-query.test.ts`,
`tests/money-flow.test.ts`, `tests/risk.test.ts` (or wherever `rankAmongPeers` is tested).

- [ ] Failing tests: a Bank-only stock gets an `ok` report whose peers are Bank members on the date
  and whose beta/capture/crash use the NIFTY 50 close and NIFTY 50 breadth; a stock in both: default
  peers NIFTY 50, `peersKey "bank"` switches; an unknown/foreign key falls back; `supportedStocks`
  lists both indices' members once each with `currentIn`; `has_card` true for a Bank-only stock in
  the three queries; the Strength sentence says "of the 13 other Nifty Bank members".
- [ ] Implement; run the audit (time it), the real-data hand check; commit.
- Expected: `bun test tests/stock-report.test.ts …` green; audit 0 mismatches.

### Task 2: Signals for Nifty Bank as episodes

**Files:** `src/query/signals.ts` (`signalsData(entry = NIFTY50)`: breadth of `entry.members`,
closes of `entry.prices`); `src/indicators/signals.ts` (Washout carries `above`/`total` of the
latest session); `src/components/signals-copy.ts` (`washoutSentence(w, label)`: NIFTY 50 wording
unchanged, other index "4 of Nifty Bank's 14 members…"; `UNTESTED_LINE`); `WashoutCard.tsx`,
`EpisodeTable.tsx` (index label in headers/footer); `src/components/IndexTabs.tsx` (base gains
`/signals`); `src/app/signals/page.tsx` (`u`, tabs, Bank view = card + washout episode rows only);
glossary entries that name the NIFTY 50 where the index now varies.
**Tests:** `tests/signals-query.test.ts`, `tests/signals-copy.test.ts`, `tests/signals.test.ts`.

- [ ] Failing tests: `signalsData(NIFTY_BANK)` uses only Bank members on each date and Nifty Bank's
  close; the NIFTY 50 sentence is unchanged; the Bank sentence uses "x of N" and never "rare"/
  percent-of-time wording; the untested line text is exact.
- [ ] Implement; compare Bank episodes with the quant's table; screenshots; commit.

### Task 3: Docs

- [ ] Decision 0035 + README row; `README.md`; `CLAUDE.md` (page list, Report Card and Signals
  paragraphs); `docs/pipelines.md` (audit scope line); folder guides via `write_section.py`;
  `TODO.md` (step B done; Financial Services next). Full `bun test` (saved), `bunx tsc --noEmit`,
  review package. Commit.
