# Top volume — design

**Date:** 2026-10-04 · **Status:** design agreed in conversation (owner: "yes please"); spec for owner review · **Path:** architectural (new data feed, new nightly step, new page)

## Intent (agreed)

- **Why:** the owner wants to see where trading money concentrates: the most-traded stocks
  for today, the last week, month, quarter and 6 months, narrowed by company size, sector
  and index. Tracking, not prediction (like Unusual activity, decision 0024).
- **Owner's choices:** the ~750 stocks of **Nifty Total Market** (owner: "lets go with 750
  stocks"); rank by **₹ value traded or by shares**, with a switch; **rolling** periods;
  an **index filter** in addition to size and sector.
- **Success:** a `/volume` page that loads instantly with the leaderboard for the latest
  session, every filter working, every stock carrying a size and a sector.
- **Out of scope:** going back in time (NSE publishes only today's index lists; see
  Limits), alerts, predictions or research findings on the page.

## Data

**Index lists**, from NSE's public archive
(`nsearchives.nseindia.com/content/indices/<file>`), one CSV per index with columns
`Company Name, Industry, Symbol, Series, ISIN Code`:

- **The universe:** `ind_niftytotalmarket_list.csv` (~750 stocks). Each stock's **sector**
  is its `Industry` value (NSE's 22 macro-sectors, e.g. "Financial Services").
- **Size:** Large = `ind_nifty100list.csv`, Mid = `ind_niftymidcap150list.csv`, Small =
  `ind_niftysmallcap250list.csv`, Micro = `ind_niftymicrocap250_list.csv`. Every universe
  stock must fall in exactly one; the ingest checks it and warns about any that don't.
- **Index filter:** a fixed, curated list of about 60 broad, sector and theme indices
  (NIFTY 50, Next 50, 100, 200, 500, Midcap/Smallcap variants, the 28 sector indices, themes
  such as CPSE, PSE, Defence, MNC, Tata Group…), each with its file name. Strategy indices
  (momentum, quality, low-volatility, equal-weight, ESG) and non-stock indices (VIX, G-Sec,
  Bharat Bond, REITs) are left out. 26 file names were checked live on 4 Oct 2026; the rest
  are checked when the list is written.
- New table **`index_constituents`** (`index_name`, `symbol`, `industry`, `fetched_on`;
  key index_name + symbol): today's members, replaced per index each night. A failed or
  empty download for an index keeps yesterday's members and logs a WARNING; it never
  empties the index.
- Symbols in NSE's lists are today's symbols, the same as `daily_prices` today; history
  across renames comes from `loadAdjustedHistory` as everywhere else.

**Leaderboard numbers**, computed nightly into **`volume_leaders`** (replaced in one
transaction, like `unusual_days`): for each universe stock and each period of the last
**1, 5, 21, 63 and 126 sessions** ending on the latest session:

- `turnover` = sum of ₹ traded (bhavcopy turnover; unaffected by splits);
- `shares` = sum of shares traded, **split/bonus-adjusted** to today's share terms
  (volume × `shareFactors`), so a 1:5 split inside the window can't inflate it;
- `change_pct` = adjusted close at the end vs the close before the period started
  (null across a gap);
- `unusual_days` = how many sessions in the period the stock appears in `unusual_days`;
- a stock with fewer sessions than the period (new listing, gap) is ranked on the sessions
  it has, and the page marks it ("12 of 21 sessions").

## The page: `/volume` ("Top volume")

- **Sidebar:** under Stocks, after Unusual activity; shortcut **v**.
- **Controls:** period tabs (1 day · 1 week · 1 month · 3 months · 6 months); rank switch
  (₹ value · Shares); size chips (All · Large · Mid · Small · Micro); sector picker (All +
  the sectors present); index picker (Any + the curated indices). All validated with strict
  comparisons against fixed sets (CLAUDE.md); anything else falls back to the default.
- **Table:** rank, stock, sector, size, ₹ traded, shares, price move over the period,
  unusual days (linking to `/activity` for that stock), sorted by the chosen measure.
  NIFTY 50 Report Card links where one exists. Scrolls inside its card under a sticky header;
  phones drop the least important columns.
- **Header line:** "As of {latest session}. Index members as of today, from NSE." plus
  "Heavy trading shows where money moved, not where prices go next." No research findings
  on the page (the owner decides on those after the "volume or the jump?" study).
- Glossary entries and `<Term>`s for: Top volume, ₹ value traded, Size group, Sector (NSE
  industry).

## Limits (stated on the page)

NSE publishes only **today's** member lists, so the page shows today's index members ranked
over the recent periods. A stock that joined an index last month is ranked on its full 6
months; one removed last month is absent. Index lists change twice a year, a few dozen
stocks at a time.

## Checks

- Parser tests on rows copied from NSE's files: header validation lists every column read
  (CLAUDE.md), a wrong header or an HTML error page is an error, never an empty index.
- Size check: universe stocks in exactly one size list; a test for the warning.
- Leaderboard maths on hand-worked histories: sums per window, split-adjusted shares, the
  price move, short histories marked, unusual-day counts.
- Query tests: each filter alone and combined; sorting by ₹ and by shares.
- Spot check: one stock's 21-session ₹ total against a direct SQL sum over `daily_prices`.
- Browser check in both themes, compact and comfortable, and phone width.

## Documentation

Decision file (universe, size and sector from NSE lists, today-only membership, nightly
tables); `docs/pipelines.md` (new feed and nightly steps); README; CLAUDE.md (page list,
commands); TODO.
