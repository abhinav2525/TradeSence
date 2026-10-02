# Upcoming screens: build handoff

Three new pages, designed and ready to build: **Advance/Decline** (TODO 3), **Screener**
(TODO 5) and **Signals & forward returns** (TODOs 2 and 4).

- **Mockups:** `mockups/advance-decline.html`, `mockups/screener.html`,
  `mockups/signals.html`. Open them in a browser; `?theme=light` shows the light theme
  and the sidebar button flips it. They link to each other like the real app would.
- **Design system:** `system/README.md` (the rules) and `system/tokens.json` (every
  value). The tokens already live in `src/app/globals.css` under the same names.
- **Every number in the mockups is sample data**, except today's 22% breadth and the
  29 Sep 2026 session. Build from the queries below, never from the mockup's values.

The mockups are static HTML with plain CSS (`mockups/bundle.css`, `mockups/screens.css`)
so they open without a build. Do not copy that CSS into the app: build each screen
from the existing React components and Tailwind token utilities, and use the mockup
only as the picture of the result.

## Build order

1. **Advance/Decline.** Needs no new data and gives Signals its breadth-thrust input.
2. **Screener.** Needs no new data.
3. **Index closes, then Signals.** Forward returns need NIFTY 50 index closes, which
   the equity bhavcopy does not carry. This is already under way in the working tree
   (`index_prices`, `src/ingest/index-prices.ts`, `bun run ingest:indices`).

Follow `CLAUDE.md` throughout: TDD, the Next.js 16 docs in `node_modules/next/dist/docs/`,
and a new file in `docs/decisions/` for every choice below that is marked **Decide**.

## Shared changes (do these with the first screen)

**Sidebar groups and shortcuts.** `SiteNav.tsx` becomes three labelled groups, each
label in the `eyebrow` style:

| Group | Page | Route | Key | lucide icon |
|---|---|---|---|---|
| Market | Breadth | `/` | b | `Activity` |
| Market | Advance/Decline | `/advance-decline` | a | `ChartColumn` |
| Stocks | Crossings | `/crossings` | c | `ArrowLeftRight` |
| Stocks | Screener | `/screener` | s | `ListFilter` |
| Research | Signals | `/signals` | g | `Radar` |

- Widen the `current` / `page` unions in `SiteNav`, `AppShell` and `Hotkeys`, and add
  the a, s and g keys to `Hotkeys`. Below lg the top bar's pills become a horizontally
  scrolling row ("A/D" is the short label).
- `MaTabs` takes `base` as a union of routes; add the new ones.
- `DateNav` hard-codes `/` in its links and its form `action`. Give it a `base` prop
  so Advance/Decline and Screener can step sessions too.

**Search-param validation.** `CLAUDE.md` requires every page to validate `ma` with the
strict `isMaKind` check before it reaches a `sql.raw` column helper. New params (`view`,
`vol`, `cond`, `range`) get the same treatment: a fixed set of strict comparisons,
falling back to the default, never interpolated raw.

**The gap rule.** Anything that walks a series must not span a hole: reuse
`segmentByGaps` from `src/indicators/compute.ts`. `MAX_GAP_DAYS` is already duplicated
in `compute.ts` and `crossings.ts`; a third use is the moment to move it into one shared
module.

**Adjusted prices.** Averages are adjusted for splits, bonuses and demergers at compute
time (`src/indicators/adjust.ts`, decisions 0002 and 0004). Every comparison against an
average must use the same adjusted series, and volume must be scaled by the same
factors (a 1:2 split doubles the share count, so raw volume reads 2× on its ex-date).

**Reuse before building.** `AppShell`, `PageHeader`, `MaTabs`, `DateNav`, `Readout` (stat
tiles), `Card`, `Badge` and the `MemberTable` table pattern cover most of each page. New
pieces are listed per screen.

## 1. Advance/Decline (`/advance-decline`)

**Question it answers:** how many constituents rose against how many fell, and is that
improving or fading?

**Data, per session D, for the members on D** (join `index_members` per date, the way
`breadthSeries` does):

- `advancing` = close > previous close, `declining` = close < previous close,
  `unchanged` = equal.
- **Decide:** use bhavcopy's `prev_close` or the previous row's adjusted close. Check
  `prev_close` on a known split ex-date from `corporate_actions`: if NSE already adjusts
  it, it is the simpler and correct choice; if not, a split day counts as a fake decline.
- `net` = A − D; `rana` = (A − D) ÷ (A + D) × 1,000 (ratio-adjusted, so the scale holds
  on days with unchanged closes).
- **McClellan oscillator** = EMA19(rana) − EMA39(rana). Reuse `ema()` from
  `src/indicators/moving-average.ts` (SMA-seeded, null-padded).
- **Summation index** = running sum of the oscillator.
- **A/D line** = running sum of `net` over the visible range; only its slope means
  anything.
- **10-day advancing share** = EMA10 of A ÷ (A + D), in percent (also the
  breadth-thrust input for Signals).

**Recommendation:** compute at query time in TypeScript, as `breadthSeries` does. It is a
few thousand sessions × 50 members, and it keeps "store everything, filter at query
time". Persist a table only if it proves slow.

**Layout** (mockup `advance-decline.html`):

- PageHeader with DateNav (eyebrow "NIFTY 50 · Market").
- A hero card (7 of 12 columns from xl), the `BreadthHero` pattern: net advances in
  `display`, a sentence ("18 constituents rose, 31 fell and 1 closed unchanged on 29 Sep
  2026."), a three-part split bar (`up` / `chart-muted` / `down` with 2px gaps), and
  on the right the last 20 sessions as diverging bars.
- A 2×2 Readout (5 columns): McClellan (badge "Below zero" / "Above zero"), Summation
  index (vs 20 sessions ago, badge "Rising" / "Falling" / "Flat"), 10-day advancing
  share (meter), advancing sessions in the last 20.
- The A/D line card, full width, with a 3M / 6M / 1Y / All range toggle and a marked
  high.
- The oscillator card (8 columns): bars coloured by sign (`up` above zero, `down`
  below), with a two-item legend, since colour carries the sign here. Beside it, a
  "Recent sessions" table (4 columns): Date, Adv, Dec, Net, McClellan.

**New components:** `SplitBar3` (or generalise the hero's split bar), a diverging bar
chart (Recharts `BarChart` with a `Cell` fill per sign), an A/D line chart (a
single-series `LineChart`, no wash).

**Tests:** classification including unchanged closes; the RANA formula when A + D = 0
(a day with every member unchanged); EMA seeding; no oscillator across a gap; members
counted only on dates they were in the index.

## 2. Screener (`/screener`)

**Question it answers:** which stocks crossed their average today, did volume back the
move, and who is about to cross?

**Data, for session D and the chosen average:**

- A **cross above** = previous session's adjusted close ≤ its average, and D's close >
  D's average, both averages non-null and no gap between the two sessions (the same
  rule `crossingStats` uses). A cross below is the mirror.
- **Volume ratio** = D's volume ÷ the mean of the 20 sessions before D (exclude D
  itself), both adjusted for share-count changes.
- **"Below for"** = sessions spent on the other side before this cross.
- **Past crossings** = the count from `crossingStats` (same average). Badge: "Calm
  crosser" at or under the index's 25th percentile, "Busy" at or over the 75th,
  "Typical" between. **Decide** the cut-offs; percentiles keep it relative.
- **Near the line** = |close ÷ average − 1| ≤ 1%, split by side, sorted by distance, with
  the gap 5 sessions ago so the reader sees whether it is closing.

**Params** (all strictly validated): `ma`, `date`, `view` = `above` | `below` | `near`
(default `above`), `vol` = `any` | `1.5` | `2` | `3` (default `2`, the TODO's threshold).

**Layout** (mockup `screener.html`):

- PageHeader with MaTabs and DateNav.
- Four Readout tiles: Crossed above today (badge: how many on ≥ 2× volume), Crossed
  below today, Within 1% of the line, Median volume of today's crossers.
- A filter card: a segmented control for `view` with counts, a volume segmented control,
  a symbol filter. The table under it: Symbol, Close, Day %, Average, Above by, Volume
  vs 20d (a 0–4× track with a hairline at 2×), Below for, Past crossings.
- Under the table, one quiet line naming what the volume filter hides ("1 more crossed
  above on lighter volume: SUNPHARMA, 1.3×.") with a link that sets `vol=any`.
- "Near the line": two cards side by side, "Could cross up next" and "Could cross down
  next", each with Symbol, Gap now, 5 sessions ago, Volume vs 20d.

**Empty states:** "No constituent crossed above its 200-day SMA on 29 Sep 2026." Say
what the filter hides when it hides something.

**Tests:** a cross on the first session after a gap is not a cross; volume ratio
excludes today and is split-adjusted; near-the-line boundaries at exactly 1%.

## 3. Signals & forward returns (`/signals`)

**Prerequisite: NIFTY 50 index closes.** The equity bhavcopy has no index values.

- In progress when this was written: the `index_prices` table (every NSE index, from
  `ind_close_all_DDMMYYYY.csv`), `src/ingest/index-prices.ts`, `bun run ingest:indices`
  and a nightly step. Finish it, backfill from 2020 (breadth history starts there;
  decision 0005), and record the source in `docs/decisions/`.
- Forward returns read `index_prices` where `index_name` is NSE's name for the NIFTY 50
  ("Nifty 50" in that file); keep that name in one constant.

**Forward-return study (TODO 2)**, per average:

- An **episode** starts on the first close under 20% (or over 80%) and ends on the first
  close back across. A re-cross within 10 sessions continues the same episode.
  **Decide** that merge window.
- Returns from the index close on the episode's first session to 21, 63 and 126
  sessions later (≈ 1, 3, 6 months). An episode too recent for a horizon shows "—" and
  is left out of that horizon's stats.
- Per horizon: median, how many were higher ("5 of 7"), best, worst, and the same median
  over all sessions as the baseline.
- By bucket: median 3-month return for breadth 0–20, 20–40, 40–60, 60–80 and 80–100%,
  across all sessions. The selected condition's bucket takes `brand`, the rest
  `chart-muted`, and a `border-strong` line marks all sessions.

**Detectors (TODO 4).** Build only what the study supports. Each is a pure function over
the series, so each is easy to test:

- **Washed out:** breadth under 20%. "Watching" within 5 pts of the line.
- **Breadth thrust (Zweig):** the 10-day advancing share (from Advance/Decline) goes from
  under 40% to over 61.5% within 10 sessions. "Watching" while it is armed (under 40%
  and the window still open).
- **Bearish divergence:** the index within X% of its 250-session high while breadth
  fell at least Y pts over 60 sessions. **Decide** X and Y from the study.
- Each detector reports: status (Active / Watching / Quiet), a one-sentence reading,
  the last time it fired, and how often it has fired since 2020.
- Run them in the nightly job after ingest; the digest (TODO 6) will read them.

**Layout** (mockup `signals.html`):

- PageHeader with MaTabs; a callout saying history starts in 2020 and the counts are
  small.
- Three detector cards (4 columns each), each with a small trend line and a threshold
  line, the status badge (`down` for Active, neutral for Watching, outline for Quiet) and
  a footer line.
- The forward-return card: condition toggle (Under 20% / 20–80% / Over 80%), the horizons
  table, a plain-language reading, and the by-bucket column chart.
- An episodes table: Started, Lowest, Sessions under, 1 / 3 / 6 months.

**Tests:** episode boundaries and merging; horizons that run past the last session; the
thrust window (40% → 61.5% within 10, and not 11); the divergence on a synthetic series.

## Design rules that matter most here

Full rules: `system/README.md`. The ones these screens lean on:

- One headline figure per page in `display`; tiles in `metric`; card titles in `heading`.
- `up` and `down` only for direction or sign, and always with a +/− sign, an arrow or a
  word. `brand` for single series and selection; `chart-muted` for context.
- Tables: `table-head` column heads on a sticky `card` header, tabular figures, the true
  minus sign "−", Indian digit grouping, dates as "29 Sep 2026".
- Charts: draw in on open and a quick morph on change, never on hover, a hover tooltip on every chart, no legend for one series, a
  legend when colour carries meaning (the oscillator's sign).
- Copy is plain and exact, and says the caveat when it changes the reading.
