# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A NIFTY 50 market-breadth tracker. Every evening it downloads NSE's free end-of-day
bhavcopy, stores all NSE equity closes, computes three moving averages for index
members, and serves a page showing how many constituents trade above each average —
plus that percentage charted since 2020, on the index's real membership each day. Other
pages: `/advance-decline` (`src/query/advance-decline.ts`: advancers vs decliners, McClellan,
A/D line), `/screener` (`src/query/screener.ts`: today's crossings with volume, and stocks
near the line), `/stock/[symbol]` (`src/query/stock-report.ts` + `src/indicators/risk.ts`:
the beginner's Report Card and risk calculator), `/crossings` (`src/query/crossings.ts`: members ranked by how often they
whipsaw across an average), `/signals` (`src/query/signals.ts` + `src/indicators/signals.ts`:
the breadth washout alarm and what the index did after each episode, 200-day SMA only) and
`/learn` (`src/lib/glossary.ts`: every term explained). New pages are specified in `docs/design/HANDOFF.md`.

**`README.md` holds the architecture diagrams and a full function reference.** Read it
before making changes; this file covers only what the code cannot tell you. (README
predates `/crossings` and does not document it yet.)

**`docs/research/` holds data studies** (question, method, results, caveats, what to
build). Re-run a study's command before quoting its numbers; they change as data grows.
A study fixes its pass/fail rules in its spec **before** looking at results, and never
tunes indicator settings. Reuse the tested machinery in `src/research/volume.ts` (`judge`,
`luckCheck` with a seeded two-sided 97.5 bar, `episodeStarts`, `excessReturn`) instead of
writing new statistics. Per-stock studies compare each occasion with other eligible stocks
on the **same date** (`matchedLuck`, `matchedBaseline` in `src/research/delivery.ts`,
[0022](docs/decisions/0022-matched-luck-check.md)); `luckCheck`'s independent random days
flatter signals that bunch up, so don't use it for a whole-market per-stock study.

**`docs/pipelines.md` lists every pipeline and its automation status** — update it
when a pipeline or a nightly step changes.

**`docs/decisions/` is the project's memory — keep it current.** Every problem hit
(bug, wrong data, ops issue, design choice) gets its own numbered file there in the
same change as the fix: the problem, the options, the decision, and *why*. Write it in
plain language — the owner reads these instead of the code — and add a row to
`docs/decisions/README.md`. Do this unprompted.

**`docs/design/` holds the design system and the specs for upcoming screens.** Read
`docs/design/system/README.md` before any UI work. `docs/design/HANDOFF.md` holds the
specs Advance/Decline, Screener and Signals were built from (Signals is partly built: only
the washout alarm; thrust and divergence wait for their studies), with mockups in
`docs/design/mockups/` (sample data only; never copy their numbers or their CSS).

**This is Next.js 16 — APIs differ from training data.** Read the relevant guide in
`node_modules/next/dist/docs/` before writing framework code. `next dev` rewrites the
Next.js block at the top of `AGENTS.md`; commit that change rather than reverting it.

## Commands

```bash
bun run dev                                    # dashboard on :3000 (next free port if taken; check its output)
bun test                                       # always against tradesence_test
bun test tests/breadth.test.ts                 # one file
bun test --test-name-pattern "idempotent"      # one test by name
bunx tsc --noEmit                              # typecheck (no linter configured)

bun run db:generate && bun run db:migrate      # schema change -> migration -> apply

bun run ingest:nifty50                         # membership since 2020, from the CSV
bun run ingest:corporate-actions 2016-01-01 2026-11-01  # splits/bonuses; ~15s
bun run ingest:symbol-changes                  # NSE ticker renames; one file
bun run ingest:indices 2020-01-01 2026-10-02   # every NSE index, daily; ~12 min
bun run ingest:delivery 2016-09-28 2026-10-04  # delivered vs traded shares; resumable
bun run db:backup                              # pg_dump: ~/Backups (7 kept) + iCloud (3)
bun run ingest:day 2026-09-25 [--force]        # one session
bun run ingest:backfill 2016-09-28 2026-09-25  # range; ~28 min, resumable
bun run indicators                             # recompute every average (~5s)
bun run audit:report-card [date]               # independent recalculation; exits 1 on a mismatch
bun run research:forward-returns               # breadth -> later NIFTY return study
bun run research:volume                        # volume indicators -> later returns study
bun run research:delivery                      # delivery % signals, whole market (~2 min)
bun run ingest:nightly                         # cron entry point
```

Needs local Postgres (`brew services start postgresql@14`) and both `tradesence` and
`tradesence_test`. `DATABASE_URL` lives in `.env`.

**Claude Code tooling** ([0018](docs/decisions/0018-claude-code-guards-and-db-access.md)):
`.claude/hooks/` blocks `bun test` outside the repo root and edits under `drizzle/`, and
typechecks after every `.ts`/`.tsx` edit. To look at data, use the `postgres` MCP server
(`.mcp.json`) rather than throwaway scripts: it connects as `claude_ro`, which can only
read `tradesence`.

`ingest:nightly` re-runs a trailing window (`NIGHTLY_LOOKBACK_DAYS`, default 7), not just
today, so a missed night heals on the next run. It runs from a launchd agent
(`ops/install-nightly.sh`, Mon–Fri 19:30, log in `~/Library/Logs/tradesence-nightly.log`).
`TODO.md` holds the prioritised roadmap.

## Design decisions that are load-bearing

**Store everything, filter at query time.** `daily_prices` holds the whole NSE cash
market because bhavcopy contains it anyway. "NIFTY 50" is rows in `index_members`,
joined per trade date. Changing universe, or correcting membership, is a query change —
never a re-download. Do not "optimise" this by filtering at ingest.

**`ingest_log` drives both idempotency and resume.** A settled day short-circuits before
any network call; an interrupted backfill resumes by being restarted.

**Status classification is the whole resilience design.** Three rules, each the fix for
a real failure:

- `holiday` is **provisional for 2 days**. NSE returns 404 for a not-yet-published file
  exactly as it does for a real holiday. A cron that runs before publication would
  otherwise cache a trading day as a holiday permanently.
- `error` is **never settled**. Transient failures must be retried, or one blip becomes
  a permanent hole nothing corrects.
- Prices are written **before** the log, without a transaction, on purpose. Dying
  between them leaves no log row, so the next run re-upserts harmlessly. The reverse
  could claim `ok` with no prices behind it.

**Averages never span a hole.** `segmentByGaps` splits the series at gaps over 21 days.
Without it a partially loaded history averages 2018 closes with 2024 closes and writes
the result out as a perfectly ordinary number. `MAX_GAP_DAYS` and `segmentByGaps` live
once, in `src/indicators/gaps.ts`, used by averages, crossings (where a hole must not count
as a crossing) and Advance/Decline. Anything new that walks a series uses them too.

**A stock's daily move is `daily_indicators.change_pct`**, computed on the adjusted,
rename-joined series ([0008](docs/decisions/0008-measuring-a-days-move.md)). Never use
bhavcopy's `prev_close` for it: it isn't adjusted on ex-dates. Volume, when needed, scales
by split/bonus factors only, never by a demerger factor.

**Weekends are fetched.** NSE trades on some (Budget days, Diwali Muhurat, special DR
sessions); `daysBetween` includes every calendar day and a weekend 404 is a holiday
([0007](docs/decisions/0007-weekend-trading-sessions.md)).

**A member's history spans every symbol it traded under.** Bhavcopy uses the symbol
current on each day, so history follows `symbol_changes` back through `symbolLineage` and
is written under today's symbol ([0003](docs/decisions/0003-renamed-symbols-lose-history.md)).
Any new per-member history (52-week highs, a new study, a new light) loads through
`loadAdjustedHistory` (`src/indicators/history.ts`): raw OHLCV across the rename lineage
plus `factors` (divide prices) and `shareFactors` (multiply volume; splits/bonuses only).
`computeIndicators` and the research scripts share it. Never re-derive adjustment or
lineage elsewhere, or a renamed member's history silently starts at its rename.

**Every term is explained once, in `src/lib/glossary.ts`.** A new metric, tile or card
title needs a glossary entry and a `<Term>` before it ships; `tests/glossary.test.ts`
checks completeness. Never put `<Term>` inside a `<Link>` or button
([0012](docs/decisions/0012-explaining-terms.md)).

**Symbols with a null average are excluded from breadth, not counted as "below".**
Otherwise every backfill opens with a fabricated bearish reading.

## Gotchas that will bite you

**Test isolation is enforced twice, and both are needed.** `bunfig.toml` preloads
`tests/setup.ts`, *and* `resolveDatabaseUrl` (`src/db/url.ts`) refuses a non-`_test`
database under `NODE_ENV=test`. The second exists because `bun test` resolves
`bunfig.toml` from the **cwd** — run from `tests/`, the preload never fires, `.env` is
never read, and the fallback pointed at the dev database, whose first visitor is
`db.delete(dailyPrices)`. Do not remove either guard, and do not weaken the connection
check to a default.

**`sql.raw` appears exactly twice**, in the `column()` helpers of `src/query/breadth.ts`
and `src/query/crossings.ts`. Each is safe only because `MA_COLUMNS` is a fixed map, and
the `ma` search param is gated by an `isMaKind` of three strict comparisons, which is
duplicated in every page (`src/app/page.tsx`, `crossings/`, `advance-decline/`, `screener/`, `signals/`).
The Screener avoids a third `sql.raw` by selecting all three averages; prefer that.
Any new page or caller must validate the same way.

**Layout is a fixed sidebar beside a scrolling document.** From `lg` up, `SiteNav` is a
fixed `w-60` sidebar and `AppShell` pads the content column with the matching `lg:pl-60`;
change both together. Below `lg` the sidebar becomes a sticky top bar. Long tables scroll
inside their card (`max-h-[520px]`, `max-h-[560px]`) under a sticky header.

**Theme and tokens.** Dark is the default and is server-rendered (`className="dark"` on
`<html>`); a stored `light` choice is applied by the inline script in `layout.tsx` before
first paint, which is why `<html>` has `suppressHydrationWarning`. Every colour, radius,
shadow and type size lives in `globals.css` and is documented in the tradeSence Design
System artifact; use the tokens (`text-up`, `bg-card`, `text-heading`), never raw hex.
The custom type sizes are registered with tailwind-merge in `src/lib/utils.ts`; a new one
added to `@theme` must be added there too, or `cn()` silently drops it.
**Density** ([0020](docs/decisions/0020-ui-density.md)) is `data-density` on `<html>`: the
server renders `compact`, the same pre-paint script applies a stored `comfortable`. Anything
it controls uses the `--density-*` tokens (`text-body-sm`, `px-card-x`, `py-card`, `gap-cards`,
`lg:px-gutter`, `h-row-head`, `py-cell`, charts `h-[calc(Npx*var(--density-chart))]`), never
raw px; `tests/density.test.ts` enforces it. New spacing tokens are registered in `utils.ts` like type sizes. `<body>` deliberately has no text size.

**NSE file quirks** (all verified against the live archive):
- Two formats. UDiFF from 2024-01-02; legacy up to ~2024-06. They overlap; the cutover
  constant sits inside the gap and the fetcher falls back between them.
- Holidays return **404 with a ~3.4 KB body**. Status code only; then validate the header.
- Legacy files sometimes use a **two-digit year** (`13-JUL-20` on 2020-07-13). Parsed
  naively that becomes year 20 AD and Postgres rejects it mid-backfill.
- Bhavcopy dates are honest, but NSE's *52-week high/low* file is **off by one** — the
  file labelled day D holds data through D−1. Not used here; remember it if you add it.
- The index file `ind_close_all_DDMMYYYY.csv` writes its date **month-first** on a few
  days (6, 10, 11 April 2023: `04-06-2023`). The parser accepts the requested day in
  either order and rejects any other date.
- Prices are **unadjusted** for splits/bonuses, and `prev_close` is not adjusted on
  the ex-date either. Averages are adjusted at compute time from `corporate_actions`
  ([0002](docs/decisions/0002-split-adjusted-averages.md)); stored averages are scaled
  back into each day's own rupees, so `close` vs MA queries need no adjustment logic.
  **Never write adjusted prices into `daily_prices`.**
- Demergers carry **no ratio** in NSE's text or bhavcopy. `demergerFactor` derives it
  as last close ÷ ex-date open, which matches TradingView exactly for RELIANCE 2023
  ([0004](docs/decisions/0004-demerger-adjustment.md)). Stored `factor` is 1 for
  `kind = 'demerger'`; the real one exists only at compute time.
- Corporate-action `subject` is free text in ~30 wordings, including abbreviations
  (`Fv Splt Frm Rs 10 To Re 1`). `classifyAction` must return `unparsed` — never factor
  1 — for share-count wording it cannot read. A new wording goes into
  `tests/corporate-actions.test.ts` first.

**shadcn components arrive in Tailwind v3 syntax.** `components.json` uses the `"default"`
style, so `bunx shadcn add` writes `h-[--cell-size]`, which Tailwind v4 silently ignores.
Rewrite every `[--var]` to `(--var)` in what it generates, and answer **no** when it asks to
overwrite `button.tsx` (customised for the design system).
([0010](docs/decisions/0010-shadcn-date-picker.md))

**Never compare two computed returns for exact equality.** The same return computed over
two spans differs in the 14th decimal, which dropped half the stocks from their own
ranking and counted flat months as losses. Remove a stock from its peers by symbol, and
compare with `NOISE_PCT` (`src/indicators/risk.ts`)
([0013](docs/decisions/0013-independent-audit-and-rounding.md)). A new Report Card number
goes into `src/audit/report-card.ts` in the same change.

**Motion goes through the tokens** ([0015](docs/decisions/0015-app-motion.md)). Durations come
from `--motion-*` in `globals.css` / `MOTION` in `src/lib/motion.ts`; charts spread
`useChartAnimation()` (a test forbids a literal `isAnimationActive`); big figures go through
`<CountUp>`; meters get a `grow-*` class. Never animate on hover or while someone types.

**Header validation must list every column the parser reads.** `at()` returns `-1` for a
missing column and `f[-1]` is `undefined`; the old code turned that into `0` and would
have written zeroed prices silently on the next NSE rename.

## Testing

TDD throughout — write the failing test first. Network tests hit the live NSE archive
deliberately: it is public and it is the component most likely to break, so mocking it
would only prove the mock works. Where a fake is genuinely needed (a corrupt zip), use
the injected `download` / `ingest` parameters rather than a mocking library.

## Membership is point-in-time, from a hand-kept file

`src/ingest/nifty50-history.csv` is the source of truth for who was in the NIFTY 50 on
each day since 2020 ([0005](docs/decisions/0005-point-in-time-membership.md)). Rows use
**today's** symbol (renamed members are joined through `symbol_changes`), and
`removed_on` is the first day *out*. `loadNifty50History` refuses any file that isn't
exactly 50 members every day; `tests/nifty50-history.test.ts` also checks the file
against NSE's live list, so **that test fails when NSE rebalances** — that is the signal
to add a row, not a flaky test. Never go back to seeding today's list over one open
interval: that reintroduces survivorship bias. Ex-members are in `index_members`, so
`computeIndicators` already computes their averages; date navigation (`resolveSession`,
`adjacentSessions`) only offers days with members.
