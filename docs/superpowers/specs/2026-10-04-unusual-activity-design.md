# Unusual activity — design

**Date:** 2026-10-04 · **Status:** design agreed in conversation (owner: "yes lets build"); spec for owner review · **Path:** architectural (new page, new nightly step, new table)

## Intent (agreed)

- **Why:** the owner wants to **see** where money suddenly went in or out of a stock:
  "people suddenly invested", "people suddenly sold and we don't know why". This is
  **tracking, not prediction**. Research 0003 found delivery spikes don't reliably lead to
  gains, so the page states facts and never says "buy" or "bullish".
- **Owner's choices:** all active stocks **and** NIFTY 50, with a switch; all four kinds of
  unusual day; a "recent unusual days" card on each stock's Report Card (facts only).
- **Success:** each evening the page lists that session's unusual stocks, sorted by how
  unusual, for any date since 2016; a NIFTY 50 stock's Report Card shows its unusual days
  in the last 3 months.
- **Out of scope:** alerts/notifications (separate TODO), Report Cards for non-NIFTY
  stocks (roadmap: Broader universes), "what happened after" on the stock card.

## The four kinds (thresholds fixed here)

Per stock, per session D, against **its own normal** = the mean of the previous 20
sessions (same gap-free segment, at least 15 values present):

| Kind | Fires when | Plain words |
|---|---|---|
| **Big keeping** | shares delivered ≥ **5×** normal | "Far more shares than usual were bought and kept" |
| **Huge volume** | shares traded ≥ **5×** normal | "Far more shares than usual changed hands" |
| **Delivery jump** | delivery % ≥ normal **+30 points** | "Buyers kept a much bigger share than usual" |
| **Delivery collapse** | delivery % ≤ normal **−30 points** | "Mostly same-day trading, far more than usual" |

- Share counts are split/bonus-adjusted (`shareFactors`), so a split can't fake a spike.
  Delivery % needs no adjustment.
- One stock-day can be several kinds at once.
- Measured over the last year (rough SQL, before splits and ETF removal): about 41, 51, 10
  and 26 a day, ~75 distinct stocks a day out of ~1,500 active. The build re-measures with
  the real calculation and reports it.
- No delivery-based kind on the five excluded days (decision 0021); Huge volume still
  applies (bhavcopy volume is unaffected).

## Who is watched

- **All active stocks:** every company (ETFs left out via `fund-symbols.txt`) whose median
  turnover over its last 20 sessions is ≥ ₹1 crore, the same filter as research 0003.
- **NIFTY 50:** the subset that was a member **on that date** (`index_members`, point in
  time).

## Data and computation

- New table **`unusual_days`**: `trade_date`, `symbol` (today's symbol, history joined
  across renames), the four kind flags, `kept_ratio`, `volume_ratio`, `delivery_pct`,
  `usual_delivery_pct`, `change_pct` (adjusted), `turnover`. Primary key
  (trade_date, symbol); index (symbol, trade_date). Only unusual stock-days are stored
  (~75 a day, ~190k rows since 2016).
- Computed by a new step, `computeUnusualDays()`, for every company through
  `loadAdjustedHistory`, so splits, demergers and renames follow the same rules as
  everything else (CLAUDE.md). The per-stock maths (`windowMean`, delivery %, ratios,
  segments, the excluded days) moves from `src/research/delivery.ts` into
  `src/indicators/activity.ts`; research 0003 imports it from there, so the study and the
  page can never disagree.
- **Full recompute each night** (replace all rows in one transaction), like the averages:
  a corporate action filed late re-adjusts history automatically. Target under ~2 minutes;
  measured during the build.
- Runs in `ingest:nightly` after delivery and the averages; `bun run activity` by hand.
  The first run fills 2016 onward.

**Rejected:** computing on page load (would re-derive split adjustment in SQL, forbidden by
CLAUDE.md); extending `daily_indicators` to every stock (much larger job, on the roadmap
separately).

## The page: `/activity` ("Unusual activity")

- **Sidebar:** under *Stocks*, between Screener and Report card; shortcut **u**.
- **Controls:** date picker and previous/next session (as on Screener); a switch
  **All active stocks / NIFTY 50**; four filter chips, one per kind, each with that day's
  count (all on by default; a stock shows if it matches any selected kind).
- **Headline:** e.g. *"62 stocks had an unusual day on 1 Oct 2026."* plus a one-line
  reminder: *"Facts about the day, not predictions: our research found big delivery days
  don't reliably lead to gains."* linking to research 0003's summary in `/learn`.
- **Table**, sorted by how unusual (the largest of the stock's ratios against its
  threshold), scrolling inside its card under a sticky header:
  stock · kinds (small badges) · shares kept vs normal ("7.2×") · volume vs normal ·
  delivery % today vs usual ("82% vs 41%") · price move that day · ₹ traded.
- NIFTY 50 stocks link to their Report Card; other stocks are plain text, with a footer
  note *"Report Cards cover the NIFTY 50 for now."*
- **Empty states:** a session before data begins, a holiday-adjacent date with no rows,
  and "no stock matched these filters".
- URL search params (`date`, `set`, `kinds`) are validated with strict comparisons like
  `isMaKind` (CLAUDE.md); anything else falls back to the default.

## The Report Card card

"**Unusual days, last 3 months**" for NIFTY 50 members: date, kinds, the ratios, delivery %
vs usual, price move. Facts only; "None in the last 3 months" when empty.

## Design system and words

- Built from the design system (`docs/design/system/README.md`), tokens only, density and
  motion tokens, existing table/card/badge components; checked in both themes.
- Glossary entries and `<Term>` for: Unusual activity, Big keeping, Huge volume, Delivery
  jump, Delivery collapse, Delivery %, "× normal". (`tests/glossary.test.ts` enforces it.)

## Checks

- Unit tests: each kind fires at exactly its threshold and not just below; a 1:2 split
  inside the window doesn't fire Big keeping or Huge volume; a stock with < 15 prior
  sessions never fires; excluded days fire only Huge volume; ETFs never appear; illiquid
  stocks never appear.
- Query tests: date + set + kinds filtering; NIFTY 50 membership is point in time; sort
  order.
- The real per-day counts are reported after the first full run (vs the estimates above).
- Browser check of `/activity` and a Report Card in light and dark, compact and
  comfortable.

## Documentation

Decision 0023 (what counts as unusual and why these thresholds; stored events vs live
calculation); `docs/pipelines.md` (new nightly step); README (page, function reference,
schema); CLAUDE.md (page list, command); TODO.
