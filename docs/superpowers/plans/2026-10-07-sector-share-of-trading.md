# Plan: sector share of trading over a year (Money flow)

Spec: `docs/superpowers/specs/2026-10-07-sector-share-of-trading-design.md` (approved 7 Oct 2026, 3-month blocks).
The spec's "Main session's changes after both reviews" (items 1–8) and the lead engineer's required items override its body.
Branch: `feat/sector-share-year`.

## Global constraints (from the spec)

- Universe and sectors exactly as Money flow today: today's Nifty Total Market list, NSE `industry`, EQ + BE through
  `loadAdjustedHistory` (renames followed). No new universe logic.
- **Now** = the last 63 sessions to D. **A year ago** = the sessions whose dates fall in the same calendar span shifted back
  exactly one year (7 Jul–6 Oct 2026 → 7 Jul–6 Oct 2025). Pooled ₹ sums, never averages of weekly shares.
- Change is in percentage points, never a percent of a percent. Sort: change desc, ties by sector name.
- Rows = sectors with ≥ `MIN_SECTOR_STOCKS` stocks on today's list; their year-ago block sums the same stocks whatever
  their count then. Small sectors: one footnote share = (total − shown) ÷ total, so rows + footnote = 100%.
- New-listing share = now-block ₹ from stocks with no traded session in the year-ago block ÷ the sector's now ₹; marked at
  `NEW_LISTING_MARK = 0.10` (≥, float-tolerant), a fixed display rule beside `MIN_SECTOR_STOCKS`, never tuned.
- "Needs a year of history" unless both blocks have sessions and the session list reaches before the year-ago block.
- Storage: `sector_flow_weeks` + `turnover`, `total_turnover`, `new_listing_turnover`; new table `sector_share_year`.
  Rebuilt nightly in the existing one-transaction rebuild. Migration via `db:generate`; backup first.
- Wording: title "Share of trading over a year"; subtitle per item 5/8; tracking not prediction; survivorship line incl.
  "today's sector labels". Glossary `share-of-trading-trend`, `new-listing-share`; `<Term>` never inside a link.
- Tokens only, `useChartAnimation`, density tokens; no new search params; card on every period tab.
- Never exact equality on computed numbers.

## Tasks

1. **Pure maths, test first** (`src/indicators/money-flow.ts`, `tests/money-flow.test.ts`):
   - `shareBlocks(days)` → `{ nowFrom, nowTo, agoFrom, agoTo } | null` (63 sessions; calendar shift; Feb 29 → Feb 28;
     null unless the ago block has sessions and `days` reaches before it). Pinned dates test.
   - `weeklySectorFlows` gains `turnover`, `totalTurnover`, `newListingTurnover`; rows for every sector shown on today's
     list in every week (ratio null when under 5 stocks traded that week). Week 0 share = page's 1-week share.
   - `sectorShareYear(stocks, blocks)` → rows per shown sector (now/ago ₹, totals incl. small sectors, new-listing ₹).
   - `shareChange(rows)` → sorted rows with now/ago share, change in pts, new-listing share and mark; small share.
2. **Schema + migration**: columns and `sector_share_year`; `bun run db:backup` first; `db:generate && db:migrate`.
3. **Compute** (`compute-money-flow.ts`): write the new columns and table; integration test in
   `tests/money-flow-compute.test.ts` (rename lineage in the year-ago block, short history → empty table).
4. **Query** (`src/query/money-flow.ts`): `shareYear()` (table rows) and `shareHistory()` (all sectors' weekly share,
   one query `order by sector, week_end`); `sectorHistory` gains `share`.
5. **UI**: `ShareTrendCard` (server) + `ShareSpark` (client, WashoutSpark pattern); `FlowHistoryChart` second small panel
   for share. Glossary entries + tests.
6. **Real data**: `bun run money-flow`; independent SQL with full rename lineage for FS, IT, Capital Goods, Healthcare, Auto;
   week-0 share vs page's 1-week share; rows + small = 100%.
7. **Screenshots** on :3100 at 1440 and 390, dark and light; one fix pass.
8. **Docs**: decision 0041 + README row, pipelines.md, README function reference, CLAUDE.md page note, folder guides,
   TODO.md / TODO-research.md (MF-4 → built).
9. **Finish**: full `bun test` (saved), `bunx tsc --noEmit`.

## Review focus

- Calendar shift and block completeness (no partial year-ago block on a short history; Feb 29).
- Rows chosen once from today's list; year-ago sums the same stocks (no inflated gain from a dropped old week).
- Totals include small sectors; rows + small = 100%; week 0 share = 1-week bar share.
- New-listing rule: zero traded sessions in the ago block; 10% boundary in float.
- Weekly rows now exist for weeks a sector had < 5 trading stocks (ratio null): the ratio chart shows a gap there.
- Wording: two snapshots, not a trend; no buy/sell implication.
