# Breadth beyond the NIFTY 50 — design

**Date:** 2026-10-05 · **Status:** approved by Claude as technical lead under the owner's overnight delegation ("some one should take incharge and give approvals"; design table agreed in conversation) · **Path:** architectural (new nightly table, Breadth page change)

## Intent (agreed)

- **Question:** what share of stocks are above their moving averages, for more than the
  NIFTY 50: the whole liquid market, the Nifty Total Market (750) and the other NSE indices.
- **Owner's rules for tonight:** backup first (done 2026-10-05 02:35, 209 MB, verified);
  **no deleting anything in the database** without the owner; all safety measures.
- **Success:** a selector on the Breadth page. NIFTY 50 stays exactly as now. "Whole market"
  shows today's reading and an honest history since 2016. Every other NSE index shows
  today's reading, with history built night by night from now on.
- **Out of scope:** history for index lists from today's members (survivorship bias,
  explained to the owner); per-stock above/below tables outside the NIFTY 50; sectors.

## Universes

| Key (`u`) | Members on day D | History |
|---|---|---|
| `nifty50` (default) | Hand-kept point-in-time membership (unchanged code path) | Since 2020, as now |
| `market` | Every company (ETFs out, `companies()`) whose median turnover over the 20 sessions to D is ≥ ₹1 crore (`liquidFlags`) | Every day, recomputed nightly |
| any `INDEX_LISTS` key except `nifty-50` | Today's NSE list (`index_constituents`) | One row per night from the first run; never back-filled |

`nifty-50` from NSE's file is left out of the selector: the point-in-time NIFTY 50 already exists.

## The numbers

- Averages exactly as `compute.ts`: SMA 50, SMA 200, EMA 200 on adjusted closes, per gap
  segment, EQ series, renames followed (`loadAdjustedHistory`). The shared part moves into a
  pure `adjustedAverages(h)` used by both, so the two can never disagree.
- Above = adjusted close > average; a stock with a null average that day is left out (not
  "below"), as for the NIFTY 50.
- Index lists: counted on the latest session only; a member counts if it traded that day and
  has the average.

## Storage (no deletes)

- New table **`breadth_daily`**: `universe` text, `ma` text, `trade_date` date, `above` int,
  `total` int; **PK (universe, ma, trade_date)**, the page's read. Market ≈ 3 × 2,300 days;
  indices 42 × 3 rows a night.
- **Writes are upserts only** (`insert … on conflict do update`). Nothing is deleted, ever, by
  this feature. (A day that later stops qualifying would leave its old row; acceptable, and
  noted for the owner.)
- Migration: one `CREATE TABLE`. Nothing dropped or altered.
- `computeBreadth()` runs nightly after Money flow; `bun run breadth` by hand; `breadth_daily`
  joins the nightly ANALYZE list.

## The page

- A form selector above the content (like Top volume's index picker): NIFTY 50, Whole market,
  then the index groups. Param `u` checked strictly against the fixed keys.
- NIFTY 50: unchanged. Others: the same hero, readout tiles and history chart, from
  `breadth_daily`; wording names the universe ("of liquid NSE companies", "of Nifty Midcap 150
  members"); "since 2020" becomes "since <first year>"; when there are fewer than 20 sessions
  the percentile tile says the history is still building. The above/below member tables and
  the washout notice stay NIFTY-50-only; other universes show a short note instead.
- Date navigation steps through that universe's own dates; `u` is kept by every link.
- Glossary: `whole-market-breadth`.

## Checks

- Unit tests first: `adjustedAverages` equals what `compute.ts` stored before (via its tests);
  the breadth counter (above/total per day, null averages left out, liquid filter, latest-day
  counting for lists); the `u` check.
- Cross-check: the new engine on point-in-time NIFTY 50 membership reproduces
  `breadthSeries` exactly on the latest days.
- Compute test on the test database: upserts, a second run doesn't duplicate, no delete.
- Live: run once, screenshots wide and phone.

## Documentation

Decision 0030; pipelines; README; CLAUDE.md (page list, command); folder guides; TODO.
