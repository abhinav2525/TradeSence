# Signals page: the breadth washout alarm — design

**Date:** 2026-10-03 · **Status:** awaiting owner review · **Path:** architectural

## Intent (agreed)

- **Why:** 200-SMA breadth has been under 20% since 1 Oct 2026. Research 0001 found this
  "washout" is the one breadth reading with a track record (the NIFTY 50 was higher 6
  months later in every past episode), but nothing in the app says so today. The home page
  shows "16%" as a plain number.
- **Success:** `/signals` shows the washout alarm as **Active** today, says when it started
  and how many times it has fired since 2020, and shows the evidence beside it: every past
  episode and what the index did 1, 3 and 6 months later, against an ordinary day. The home
  page carries a one-line notice while it is Active.
- **Owner's choices (2026-10-03):**
  1. **Scope A:** the washout alarm plus the history that supports it. The breadth thrust
     and the divergence detectors are **left out entirely** (no "coming soon" cards) until
     their own studies say they are worth building.
  2. **200-day SMA only, no average tabs.** It is the only average research 0001 found
     reliable; the 50-day was noisy and the 200 EMA nearly identical.
  3. **Home-page notice**, shown only while the alarm is Active.
- **Constraints:** same episode rule as research 0001 and the Report Card (one shared
  function); every number computed live from the database, never copied from the research
  note; sample sizes and the small-sample caveat always visible; glossary entry and `<Term>`
  for every new term; design-system tokens and motion rules; mockup layout, never its numbers.

## Approach

Compute on every page view, as Advance/Decline does: ~1,700 sessions × 50 members, a
fraction of a second. Pure functions in `src/indicators/`; the query only assembles them.

Rejected: a nightly `signals` table (only pays off when the nightly digest needs it, which
is a later TODO item); reusing the research CLI (it prints Markdown, not data).

## Definitions

- **Breadth:** `breadthSeries("sma200")` (`src/query/breadth.ts`), the same series the home
  page and research 0001 use. Only sessions that also have a NIFTY 50 index close
  (`index_prices`, `index_name = 'Nifty 50'`, one constant) are used, as in the study.
- **Episode (under 20%):** starts on the first session with breadth `< 20`. A session that
  qualifies within `MERGE_GAP` (10) sessions of the last qualifying one continues the same
  episode; 11 or more non-qualifying sessions in between start a new one. Exactly the rule
  of `findEpisodes` today.
  - **Over 80%:** the same with breadth `>= 80` (as in the study).
  - Each episode reports: start date, last qualifying date, **lowest** reading (highest for
    over 80%), and **sessions under** (qualifying sessions within the episode).
- **Forward return:** NIFTY 50 close `h` sessions after the episode's start ÷ close on the
  start − 1, in %, for h = 21, 63, 126 (`HORIZONS` from `src/research/forward-returns.ts`).
  **Null** when that session hasn't happened yet, or when the stretch spans a hole in the
  data (`segmentByGaps` / `MAX_GAP_DAYS` from `src/indicators/gaps.ts`). A null is shown as
  "Not yet" when the horizon runs past the latest session (each episode carries a `pending`
  flag per horizon), "—" for a gap, and is left out of that horizon's summary.
- **Status**, from the latest session's breadth `p`:
  - **Active:** `p < 20`.
  - **Watching:** `20 <= p <= 25` (within 5 points, or just recovered).
  - **Quiet:** `p > 25`.
- **Times fired since 2020:** number of under-20% episodes, including an ongoing one.
- **Horizon summary** (per horizon, over episodes with a non-null return): count, median,
  how many were higher (`> NOISE_PCT`, so a flat 0.00% is not "higher"), best, worst; plus
  the **baseline**: the median over every session with a non-null return.
- **Buckets:** median 63-session return over all sessions in each breadth bucket
  (`BUCKETS` / `bucketOf`: < 20, 20–40, 40–60, 60–80, ≥ 80), plus the all-sessions median.

## Page: `/signals`

Section `signals`, sidebar group **Research**, label "Signals", key **g**, lucide `Radar`.
No date navigation and no average tabs: the page is "as of the latest session". The `ma`
param is still carried (validated by `isMaKind`) only so the nav keeps the reader's choice
on other pages.

1. **PageHeader:** eyebrow "NIFTY 50 · Research", title "Signals", description "What
   happened next. Index returns after breadth extremes, and the alarm that history
   supports." Below: an info callout, "History starts in 2020, on the index's real
   membership each day. Six years hold only a handful of washouts, so read the direction,
   not the decimals."
2. **Washed-out card** (`WashoutCard`), full width, the text beside the sparkline from md
   (a lone half-width card would leave an empty half; amended while planning):
   - Title `<Term id="washout">`; status badge: Active = `down` tone, Watching = neutral,
     Quiet = outline. The word is always shown.
   - Sentence by status, e.g. Active: "16% of NIFTY 50 stocks are above their 200-day SMA,
     under the 20% line since 1 Oct 2026." Watching: "22% …, 2 pts above the 20% line."
     Quiet: "48% …, well clear of the 20% line."
   - Sparkline of the last 60 sessions' breadth with a dashed 20% threshold line (Recharts,
     `useChartAnimation()`, hover tooltip).
   - Footer: "Fired 6 times since 2020 · this one started 1 Oct 2026" (or "last fired …").
   - Note: "Only the 200-day SMA: it is the one average research found reliable."
3. **Forward-returns card** (`ForwardReturns`), full width:
   - Segmented switch **Under 20% / Over 80%** (`?cond=under|over`, strict check, default
     `under`; one `SlidingPill`). The mockup's "20–80%" option is dropped: that is ordinary
     days, which the bar chart already covers.
   - Table: Horizon · Median · Higher ("5 of 5") · Best · Worst · Any day.
   - One generated sentence reading the table, always naming the sample size, e.g. "Every
     finished episode was higher six months on, and the median beat an ordinary day at
     every horizon. The first month was lower once (Mar 2020). Five episodes is a small
     sample." For Over 80%: says plainly there is no edge, so it is not an alarm.
   - Bar chart (`ReturnBuckets`): median 3-month return per bucket, the selected
     condition's bucket in `brand`, the rest `chart-muted`, a `border-strong` reference line
     "Any day". Footer: "By session: neighbouring days overlap, so the episodes above are
     the honest count."
4. **Episodes table** (`EpisodeTable`), full width, for the selected condition, newest
   first: Started · Lowest (Highest for over 80%) · Sessions under (over) · 1 month ·
   3 months · 6 months. Signed, true minus, `up`/`down` with the sign.

Empty state (no breadth or no index closes): the same "Nothing loaded" card the other pages
use, naming `bun run ingest:indices` and `bun run indicators`.

## Home-page notice

On `/` when the washout status is **Active** and the reader is viewing the latest session
(no `date`, or `date` resolves to the latest): a one-line callout above the hero, `down`
accent, "**Washout:** under 20% of NIFTY 50 stocks are above their 200-day SMA. The last
{n} times, the index was higher 6 months later in {k}. See Signals →". `{n}`/`{k}` come
from the 6-month summary, never hard-coded. Shown whichever average tab is selected, since
it always names the 200-day SMA. `<Term>` is not placed inside the link.

## Code

| File | Change |
|---|---|
| `src/indicators/episodes.ts` | Add `findEpisodeSpans(pct, test, mergeGap)` → `{ start, last, sessions }[]` (indices). `findEpisodes` becomes `spans.map(s => s.start)`. |
| `src/indicators/signals.ts` (new, pure) | `WASHOUT_LINE = 20`, `WATCH_BAND = 5`, `washoutStatus(p)`, `forwardReturnSafe(closes, segments, i, h)`, `episodesWithReturns(...)`, `summarizeHorizon(values)`, `bucketMedians(...)`. |
| `src/query/signals.ts` (new) | `signalsData()`: loads breadth + closes, joins by date, segments, returns everything the page needs for both conditions. |
| `src/app/signals/page.tsx` (new) | The page; validates `ma` and `cond`. |
| `src/components/WashoutCard.tsx`, `ForwardReturns.tsx`, `ReturnBuckets.tsx`, `EpisodeTable.tsx` (new) | The three cards and the chart. |
| `src/app/page.tsx` | The notice. |
| `SiteNav.tsx`, `AppShell` types, `Hotkeys`/`hotkey-target.ts` | Research group, `signals` section, key `g`. |
| `src/lib/glossary.ts` (+ `glossary-live.ts`) | Terms `washout`, `episode`, `forward-return` (topic "Breadth"), each with a live example. The existing `breadth-thrust` entry stays (it explains the A/D tile). |

## Tests (written first)

- `findEpisodeSpans`: merge at 10 sessions, split at 11; `sessions` and `last` correct;
  `findEpisodes` output unchanged (existing `forward-returns.test.ts` and
  `market-risk.test.ts` pass untouched).
- `washoutStatus`: 19.99 Active, 20 Watching, 25 Watching, 25.01 Quiet.
- `forwardReturnSafe`: null past the end; null across a segment break.
- `summarizeHorizon`: odd/even median; 0.00% not counted as higher; empty input.
- Episodes: lowest/highest and sessions per condition; an ongoing episode has null returns.
- `bucketMedians` on a small synthetic series.
- `cond` validation rejects anything but `under`/`over`; `hotkeyTarget("g")` → `/signals`.
- Glossary completeness (existing test) covers the new ids; motion test scans the new
  components.
- Live check: the page's 6-month "higher" count matches `bun run research:forward-returns`.

## Documentation (same change)

- `docs/decisions/0017-signals-washout.md` + README row: scope (washout only; why thrust
  and divergence wait), 200-SMA only, dropping "20–80%", live compute vs nightly table, and
  the weekend-sessions shift in the study's numbers (8 weekend sessions added by decision
  0007 after research 0001 was written: 1,670 → 1,678 sessions; the early-2025 episode now
  starts 24 Feb 2025).
- `docs/research/0001-does-breadth-predict.md`: refresh tables from today's re-run, with a
  dated note on why they moved.
- `README.md` function reference, root `CLAUDE.md` page list, `TODO.md` (tick the item,
  update "where we left off"), `docs/pipelines.md` unchanged (no new pipeline step).

## Out of scope

Breadth thrust and divergence detectors (need studies), nightly persistence and the digest,
date navigation on `/signals`, other universes.
