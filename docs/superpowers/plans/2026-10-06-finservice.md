# Nifty Financial Services, the third registered index — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** register Nifty Financial Services (20 members, true membership since 2020) so every
page that runs on Nifty Bank's real membership (Breadth, Advance/Decline, Crossings, Screener,
Unusual activity, Signals, Report Cards) runs on it too: one registry entry plus its tests, and
every place that still assumes "two indices" made generic.

**Spec:** `docs/superpowers/specs/2026-10-05-bank-finservice-indices-design.md` (approved
2026-10-05). Built on decisions 0034 (step A), 0035 (step B), 0036 (the CSV, Yes Bank date).

## Global Constraints (from the spec and the owner)

- Registry entry: key `financial-services`, members `NIFTYFINSERVICE`, prices
  `Nifty Financial Services`, list `financial-services`, label "Nifty Financial Services",
  file `niftyfinservice-history.csv`, size 20 throughout. Order: NIFTY 50, Nifty Bank,
  Nifty Financial Services (a stock in several keeps its earlier default card).
- The NIFTY 50 stays the Report Card's market line; the index only picks the peers.
- "x of 20" wording, no percentile or "rare" wording; Signals = episode rows only, with the
  untested line; nothing retuned. Cross-page hotkeys don't keep `u`.
- Reload is `bun run ingest:members financial-services` (that index's rows only, guarded).
  No other deletes. Derived rows are upserted by `bun run indicators`.
- TDD; tests from the repo root; glossary entry + `<Term>` for the new index; tokens only;
  every URL parameter strictly validated; no new `sql.raw`.

## Tasks

- [ ] 1. Tests first: `tests/niftyfinservice-history.test.ts` (schedule, spot checks both sides of
  2020-06-26, 2022-08-08, 2024-10-10, 2026-03-30, SHRIRAMFIN listed_as SRTRANSFIN, live drift);
  registry tests for three entries; `pointInTime("financial-services")`; Unusual activity
  `set=financial-services`; `auditCards`, `stockGroups`, `supportedStocks`, IndexTabs with three.
- [ ] 2. Registry entry + a `term` field (each index's glossary id) + `IndexKey` from the registry.
- [ ] 3. Generic code: Unusual activity sets from the registry; picker groups list each stock once
  (first registered index it is in); "bank"-only wording on Breadth, Advance/Decline, Crossings
  becomes "member"; the Breadth tile uses the index's own glossary term.
- [ ] 4. Glossary: `nifty-financial-services` (live example), membership / relative-strength /
  washout / forward-return mention it; Yes Bank's date corrected to 19 Mar 2020 (decision 0036).
- [ ] 5. Load: `ingest:members financial-services`, `indicators` (row count before/after; 3-symbol
  byte check), `audit:report-card` (0 mismatches, time).
- [ ] 6. Real-data checks: breadth above the 200-day SMA on 2022-08-08 and 2024-10-10 by SQL vs
  `breadthSeries`; one FS-only Report Card rank by hand; the washout episodes.
- [ ] 7. Screenshots (rsync copy on :3100), docs (decision 0037, README, CLAUDE.md, folder guides,
  TODO), full `bun test`, `tsc`, review package.

## Review Focus

- Nothing for the NIFTY 50 or Nifty Bank changed: indicator rows byte-identical on a sample, the
  audit's NIFTY 50 and Bank cards still 0 mismatches.
- A stock in both NIFTY 50 and Financial Services (HDFCBANK, BAJFINANCE) still opens on its NIFTY 50
  card; CHOLAFIN (FS only) opens on its FS card, its risk lights against the NIFTY 50.
- `set=` on Unusual activity and `u=` everywhere accept exactly the registered keys.
- The picker lists each current stock once.
