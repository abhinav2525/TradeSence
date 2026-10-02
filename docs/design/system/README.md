tradeSence is a NIFTY 50 market-breadth dashboard: every evening it reads NSE's end-of-day file and shows how many of the fifty constituents trade above their moving average, how rare that reading is against every session since 2020, and which stocks whipsaw across the line. The interface is a modern fintech instrument: dark by default, calm chrome, and colour spent only on measurements.

The code is Next.js 16 with Tailwind v4 and shadcn/ui. Every token below is a CSS custom property in `src/app/globals.css` with the same name (`--brand`, `--card`, `--shadow-card`), exposed to Tailwind as utilities (`bg-card`, `text-up`, `shadow-card`, `text-heading`). Use the tokens; never paste a hex value into a component.

## Principles

- **The number first.** Each page leads with one figure in `display` and lets everything else explain it: how rare, which way, compared with what.
- **Colour is data.** Neutrals carry the chrome. Only `brand`, `up` and `down` carry hue, and each means one thing.
- **Never colour alone.** Every up/down value also carries a sign (+ / −), an arrow or a word ("Above", "Deteriorating").
- **Quiet depth.** Cards lift off the ground with `shadow-card` and a hairline `border`, not with gradients or glow.
- **Keyboard-first.** ← → step sessions, 1 2 3 switch the average, b c switch page, t flips the theme. Focus is always visible.

## Content fundamentals

The voice is a careful analyst explaining a chart to a colleague: plain, exact, a little dry. It says what a number means and where it stops meaning anything.

- Sentence case for titles, buttons and labels ("Breadth over time", "Five-session change"). UPPERCASE only for `eyebrow` and `table-head`.
- Short declaratives. Real examples: "Whipsaw, not strength." "Under the halfway line, most of the index sits below its own long-term average." "No constituents on this side of the line."
- Explain the caveat in the interface when it changes the reading: "A crossing counts only between consecutive sessions that both have an average, so neither the start of the averaging window nor a gap in the data can fake one."
- Errors and empty states say what happened and what to run: "26 Sep 2026 was not a trading session. Showing 25 Sep 2026." "Nothing loaded for that session. Run `bun run ingest:backfill` then `bun run indicators`."
- No "I" or "we"; address the reader rarely, never with "you should". No emoji, no exclamation marks.
- Numbers: percentage-point changes are "pts" ("−12 pts"); use a true minus sign "−", not a hyphen; signed values always carry + or −. Dates read "29 Sep 2026" (ticks: "Sep ’26" or the year). Large counts use Indian grouping ("3,337"; "1,23,456"). Durations in sessions are "15d".
- Name things the way the market does: NIFTY 50, NSE, 200-day SMA, 200-day EMA, 50-day SMA, ticker symbols in their NSE form (BAJAJ-AUTO, M&M).

## Colour

Two themes from one set of names: `dark` (the default, server-rendered) and `light` (behind the toggle). Every text token's note gives its worst contrast across `background`, `card`, `raised` and `popover` in both themes; all clear 4.5:1.

- **Ground and surfaces.** Page on `background`; every section in a `card` with a `border` hairline and `shadow-card`. Hover and tracks use `raised`; the selected segment sits on `thumb` with `shadow-thumb`; tooltips on `popover` with `shadow-pop`.
- **Text.** `foreground` for primary text and figures, `foreground-2` for descriptions and sub-lines, `muted-foreground` for labels, column heads, ticks and hints.
- **Brand.** `brand` is the one hue of the product: the breadth series (`chart-1` aliases it), today's bin in the distribution, the active nav icon, the primary button, links and focus (`ring`). Text on a brand fill is `brand-foreground`, which is dark ink in the dark theme. Tints behind brand text use `brand-soft`.
- **Up and down.** `up` means above the average or improving; `down` means below or deteriorating. Use them for fills, dots, meters and signed values, never for decoration or headings. Pills put `up`/`down` text on `up-soft`/`down-soft`. The pair differs in lightness as well as hue (colour-blind ΔE 14.0 dark, 9.2 light, Machado protan/deutan), and both stay clear of `brand` (ΔE above 24).
- **Charts.** One series takes `chart-1`. Context marks and empty tracks take `chart-muted`. Gridlines are `grid-line`, solid, horizontal only. The 50% reference line is `border-strong`.
- **Lines.** `border` is decorative only. A control that needs a visible edge (the date field) takes `input`, which clears 3:1.
- **Focus.** A 2px solid `ring` outline, offset 2px, on every focusable element (`:focus-visible` in `globals.css`). It clears 4.6:1 on every surface.

## Type

One family, Geist, does everything including figures; Geist Mono is only for keys, typed dates and code. Both load through `next/font/google` as `--font-geist-sans` and `--font-geist-mono`.

- `display` (64/64, 600, −0.04em) for the single headline figure; its % sign drops to 45% in `muted-foreground`.
- `metric` (28/32, 600) for stat-tile values, with a trailing unit at 13px.
- `title` (24/32, 600) for the page title; `heading` (15/20, 600) for card titles.
- `body` (14/20) by default; `body-sm` (13/20) for descriptions, nav, buttons and table cells; `caption` (12/16) and `label` (12/16, 500) for tile sub-lines and labels.
- `eyebrow` (11/16, 600, +0.08em, uppercase) above page titles and in the sidebar; `table-head` (11/16, 500, +0.06em, uppercase) for column heads; `badge` (11/16, 500) in pills.
- Standalone big numbers keep Geist's proportional figures. Tables, axis ticks and any column of numbers use `tabular-nums` so digits align.
- The custom sizes are Tailwind utilities (`text-display`, `text-metric`, `text-title`, `text-heading`, `text-eyebrow`) and are registered with tailwind-merge in `src/lib/utils.ts`; add any new one there too.

## Space, shape and depth

- A 4px grid. Cards pad `space-5`; cards and tiles sit `space-4` apart; the page gutter is `space-4` on phones, `space-6` from sm and `space-8` from lg.
- Touching fills (the above/below split bar, histogram bins) are separated by a `space-0.5` surface gap, never by a stroke.
- Radii nest: a `radius-md` track holds `radius-control` items; cards and tiles are `radius-lg`; pills, meters and dots are `radius-full`; kbd chips `radius-sm`.
- Elevation has three steps only: `shadow-card` (cards, tiles, the date navigator), `shadow-thumb` (selected segment), `shadow-pop` (tooltips).

## Layout

- From lg, a fixed `sidebar-width` sidebar (SiteNav) holds the wordmark, the two sections, the latest NSE close, the shortcut list and the theme toggle. Below lg it becomes a sticky top bar with the wordmark, two nav pills and an icon-only toggle.
- The content column is capped at `content-max-width` on a 12-column grid. Breadth: PageHeader, then BreadthHero (7 columns) beside a 2×2 Readout (5 columns) from xl, stacking as a full-width hero over four tiles at lg; then the BreadthArea card full width; then the two MemberTables side by side from xl.
- Crossings: PageHeader, four Readout tiles, then CrossingsBars (5 columns) beside the CrossingsTable card (7 columns) from xl.
- The document scrolls as a whole. Long tables scroll inside their card under a sticky `card`-coloured header, capped at `table-max-height`.
- Below sm, tables drop their least important columns (Average; Avg run and Last crossed; In run below md) rather than scroll sideways.

## Charts

- Pick the form by the question: a share over time is an area; a ranking of named things is a horizontal bar (ticker labels read straight across); where today sits among every session since 2020 is a histogram with today's bin in `brand`.
- One series means one colour and no legend; the card title names it. Bars are never recoloured by value.
- Lines are 2px `chart-1`; the area under them is a `chart-1` wash fading from 32% to 2%. Bars are at most 18px thick with 4px rounded ends at the value end, square at the baseline. Active dots are 4px radius with a 2px `card` ring.
- The breadth chart shades the extremes: 80–100% in `up` at 6%, 0–20% in `down` at 7%. The selected session gets a 1px `foreground` rule at 35% and a 5px dot.
- Axis text is 11px `muted-foreground` with tabular figures; y ticks read "0% 20% 50% 80% 100%". Values and labels wear text tokens, never the series colour.
- Every chart has a hover layer: a crosshair and tooltip on the area (date as the heading, then "29 of 49 above · 59.2%"), a per-bar tooltip on bars, a per-bin tooltip on the histogram. Charts draw in once on open and morph on a change; hover is instant (see States and motion).

## States and motion

- Hover: rows and ghost controls move to `raised`; links and inactive segments move from `muted-foreground` to `foreground`.
- Selected: segments sit on `thumb` with `shadow-thumb`; the active nav item sits on `brand-soft` with a `brand` icon.
- Disabled: 40% `muted-foreground` and no pointer (the session stepper at either end of history).
- Selected segments sit on one sliding pill (`SlidingPill`), which moves to the chosen option; without JavaScript the option keeps its own thumb.

**Motion** (decision 0015). Polished and smooth, never in the way. Four rules:

1. **Only when something opens or changes, never while you read.** Hover, crosshairs and tooltips are instant; nothing loops (the loading shimmer runs only while waiting).
2. **The final value is the true one.** Figures end exactly on the server-rendered text, which is in the HTML from the first paint and in an `sr-only` copy for screen readers.
3. **`prefers-reduced-motion` turns it all off**, in CSS and in JavaScript.
4. **One clock:** `--motion-fast` 150ms, `--motion-base` 300ms, `--motion-slow` 600ms and `--ease-out`; JavaScript reads `MOTION` from `src/lib/motion.ts`.

| Element | On open | On a change | Tool |
|---|---|---|---|
| Cards and tiles | Fade and rise 8px, `base`, staggered 40ms (first 8) | none | `.reveal` (on `Card`) |
| Big figures | Count up from 0, `slow` | Count from the shown value, `base` | `<CountUp text>` |
| Charts | Draw in, `slow` | Morph, `base` | `useChartAnimation()` |
| Meters and bars | Grow from 0, `slow` (first screenful of a table only) | Slide, `base` | `.grow-x`, `.grow-x-end`, `.grow-y`, `.grow-y-top`; markers `.fade-in` |
| Traffic lights | Pop in after their card | Colour fade | `.pop-in` |
| Pages | New page fades in, `base`; old fades out, `fast`; sidebar still | none (same page) | `<ViewTransition>` in `AppShell` |
| Switches | | Pill slides, `fast` | `SlidingPill` |
| Popovers, date picker | Zoom and fade, `fast` | | `tw-animate-css` |
| Loading | Shimmering page skeleton | | `app/loading.tsx` |

Not animated: the risk calculator's rupee figures (they change as you type).

## Iconography

- lucide-react, 16px (`size-4`) at the default 2px stroke; 12px inside badges; 18px in the wordmark tile. Icons sit in `muted-foreground` at rest and `brand` when active.
- In use: `activity` (Breadth), `arrow-left-right` (Crossings), `chart-spline` (the wordmark tile), `chevron-left` / `chevron-right` (session stepper), `sun` / `moon` (theme toggle), `arrow-up-right` / `arrow-down-right` (direction in tiles and the Now column).
- The split bar uses the text glyphs ▲ and ▼ beside its counts. No emoji anywhere.
- There is no logo. The product name is set in plain type ("tradeSence", 15px semibold) beside lucide's `chart-spline` in a 32px `brand-soft` tile; replace the tile when a real mark exists.

## Accessibility

- Text contrast holds at 4.5:1 or more on every surface in both themes; marks and control edges hold 3:1.
- Direction is never colour alone (sign, arrow or word), and the up/down pair is separated by lightness for colour-blind readers.
- Charts carry tooltips, and the distribution has an `aria-label` that states today's value and percentile.
- The theme toggle has an accessible name and the `t` shortcut; the theme is applied before first paint, so there is no flash.
