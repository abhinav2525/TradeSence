# Bank Nifty and Nifty Financial Services, with true history — design

**Date:** 2026-10-05 · **Status:** reviewed by quant-advisor (proceed with 3 changes) and lead-engineer (proceed with changes), both folded in below; awaiting owner approval · **Path:** architectural (new membership data, wider nightly compute, an index selector on six pages)

## Intent (agreed)

- **Owner's ask:** the NIFTY 50 features (Advance/Decline, Crossings, Screener, Unusual
  activity, Report Card, Signals) for **Nifty Bank** (14 stocks today) and **Nifty Financial
  Services** (20). Nifty 500, Midcap 150 and Smallcap 250 wait ("think about others later").
- **Why these two first:** small, slow-changing memberships, so their true day-by-day
  membership since 2020 can be rebuilt by hand from NSE Indices' press releases, exactly as
  the NIFTY 50's was (decision 0005). That gives **honest history**, so every feature works
  the same way it does for the NIFTY 50, with no "today's members" approximation.
- **Success:** an index selector (NIFTY 50 / Nifty Bank / Nifty Financial Services) on the six
  pages; a Report Card for every member of the two indices; nightly upkeep; a test that fails
  when NSE rebalances either index (the signal to add a row, as for the NIFTY 50).
- **Out of scope:** the three large indices; any new signal or study; changing how any
  existing NIFTY 50 number is computed.

## Data

We already hold every member's prices, volume and delivery since 2016, and both indices' own
daily closes since 2016 (`index_prices`: "Nifty Bank", "Nifty Financial Services"). Two things
are added:

1. **Point-in-time membership since 2020-01-01**, hand-kept, one CSV per index in
   `src/ingest/` (`niftybank-history.csv`, `niftyfinservice-history.csv`), same columns as
   `nifty50-history.csv` (today's symbol, `listed_as`, `added_on`, `removed_on`, source
   press release named in the header). Sources: `https://www.niftyindices.com/press-release`
   (reachable; it's where the NIFTY 50 file came from). Loaded into `index_members` under
   `index_name = "NIFTYBANK"` and `"NIFTYFINSERVICE"`.
   - The loader is the existing one, generalised: it takes the index name and the **expected
     member count per period** (Nifty Bank has had 12 and now 14; the file states the count
     for each date range) and refuses a file that has a gap, an overlap, or a wrong count on
     any day. `tests/*-history.test.ts` compare each file with NSE's live list, so a rebalance
     fails the test on purpose.
   - **Note for the owner (no-delete rule):** reloading a membership file replaces that
     index's rows in `index_members` inside one transaction, from the file, which is the
     source of truth. The NIFTY 50 loader already works this way. The owner is asked to
     confirm this one exception explicitly; nothing else in this work deletes.
2. **Averages and daily moves for every member** (`daily_indicators`): `computeIndicators`
   runs for all three index names nightly (members past and present; the union is ~85
   symbols, ~60k new rows). Nothing changes for NIFTY 50 rows.

Breadth for the two indices comes from the point-in-time path (`breadthSeries(indexName)`),
not from `breadth_daily`'s today's-list rows; the Breadth selector routes "bank" and
"financial-services" to the honest history.

## The pages

One `index` parameter (`nifty50` default, `bank`, `finservice`), checked by a strict
`cleanIndex` like `isMaKind`, carried by every link, hotkey and date step on the page, and
rendered as a segmented control beside the average tabs (same component on every page).

| Page | What changes | Data path |
|---|---|---|
| Breadth | selector already exists; the two keys route to point-in-time membership | `breadthSeries`, `breakdownOn` with the index name |
| Advance/Decline | advancers/decliners, A/D line, McClellan for the index | `advanceDeclineCounts(indexName)` |
| Crossings | members of that index ranked by crossings since 2020 | `crossingStats(indexName)` |
| Screener | that index's crossers and near-the-line names | `screenerOn(ma, date, indexName)` |
| Unusual activity | `set` gains `bank` and `finservice` (member **on that date**) | existing `member` join with the index name |
| Report Card | every member gets a card; peers = that index's members on the date; the "market" comparisons use the index's own close ("In crashes", "Bad days", beta) | `stockReport(symbol, indexName)`; `supportedStocks` lists all three |
| Signals | the washout alarm and "what happened next" for the index, same rules (share above the 200-day SMA under 20%), **on the index's own close** | `signalsData(indexName)` |

Wording names the index everywhere ("of Nifty Bank's 14 members"), and the Report Card's
peer rank says "among the 13 other Nifty Bank members". Glossary entries that say "NIFTY 50"
become "the chosen index" where they are shared.

**Honesty notes to state on the pages:** with 12–20 members, breadth moves in big steps
(one stock = 5–8 points), so percentile and "rare" readings are coarser than the NIFTY 50's;
Signals' episode counts will be small, and the page already says to read the direction, not
the decimals. No new claims; no study is implied.

## Nightly

`computeIndicators` for the three indices (after the price step, before Unusual activity);
the membership drift check runs for all three lists; the audit (`src/audit/report-card.ts`)
recalculates the new cards too (the Report Card rule: every number is independently
recomputed). Expected extra time: well under a minute.

## Checks

- Unit tests first: the generalised loader (gap, overlap, wrong count per period refused;
  the NIFTY 50 file still loads unchanged); `cleanIndex`; each query with the index name
  returns only that index's members on the date (a test with a member that left mid-window).
- Live: both CSVs vs NSE's lists today (the drift test); breadth for Nifty Bank on a day with a
  known rebalance; one Bank Nifty Report Card number recomputed by hand; the audit at 0
  mismatches across all cards.
- Screenshots of each page with the selector, wide and phone.

## Documentation

Decision 0034; `docs/pipelines.md` (indicators step covers three indices); README;
`CLAUDE.md` (the membership paragraph covers three files); folder guides; glossary; TODO.

## Changes after the advisor reviews (adopted; reviews in `docs/proposals/2026-10-05-review-bank-finservice-spec-*.md`)

**From the lead engineer**
1. **One registry, one key per index.** A TypeScript registry entry per index (`key` as the
   page parameter, membership name in `index_members`, NSE's name in `index_prices`, the
   `INDEX_LISTS` key, label, membership file, expected member count by date). Every query,
   page and test reads names from it; the three spellings of "Nifty Bank" become one.
2. **One parameter, `u`, with the keys Breadth already uses** (`bank`, `financial-services`),
   a query parameter like `ma`/`date`, validated by one shared function; NIFTY 50 stays the
   default so no existing link changes. `/?u=bank` routes to point-in-time membership;
   `/?u=private-bank` (no file) keeps today's list.
3. **Compute once:** `computeIndicators` runs over every stock in any index (shared stocks
   once), wrapped in an error catch like the later steps.
4. **Drift check** compares the files with the lists the nightly already downloads
   (`index_constituents`), after that step; plus a nightly warning if a file and the database
   differ (a CSV edited without reloading).
5. **Delete-and-reload from the file is a standing rule, with guards:** limited to that
   index, one transaction, file and index name bound together in the registry, and a reload
   that would store fewer rows than today is refused without `--force`.
6. **`has_card`** on Unusual activity and Top volume covers members of any registered index.
7. **Ship in two steps:** A) registry, loader, compute, Breadth, Advance/Decline, Crossings,
   Screener, Unusual activity; B) Report Card and Signals.
8. The audit covers every (stock, index) card; time it before and after.

**From the quant advisor**
9. **Report Card "market" stays the NIFTY 50** for the risk lights (beta, "Bad days", "In
   crashes"): HDFC Bank is a quarter to a third of Nifty Bank, so measuring a bank against
   Nifty Bank partly compares it with itself. The chosen index is used only for the peer
   rank, and the page says so.
10. **Signals for these indices: episode rows only.** Each washout episode with what the
    index did after, so the count is visible; no medians or "higher in x of y" summaries; one
    line: "Same 20% line as the NIFTY 50 alarm; never tested on this index; several episodes
    are the same sell-off." No retuning of the 20% line, the 10-session merge or the watch band.
11. **"x of N counted" everywhere; no "rare" or percentile wording** for these indices (one
    stock moves Nifty Bank's breadth by 7 points; it has only 15 possible readings); check
    McClellan's "extreme" wording on 14 stocks, or hide that line for them.

**Numbers the quant found (today's members, so slightly understated):** since 2020 the
breadth reading crossed the 20% line 26 times for Nifty Bank and 17 for Financial Services
(NIFTY 50: 9); Nifty Bank had 6 washout episodes but only 3 separate sell-offs; Financial
Services 5, one live now (1 of 20 members above its average). The true NIFTY 50 membership
finds 6 washouts where today's members find 4: the survivorship effect this spec avoids.

## Questions for the advisors (answered above)

- Quant: is anything misleading about running the NIFTY 50 Signals rules on a 14-stock index?
  Should Signals for these indices show episodes only, with no "what happened next" medians,
  until counts are meaningful?
- Engineering: one generalised loader vs one per file; where the per-period expected count
  should live; whether `index` should be a path segment or a query parameter.
