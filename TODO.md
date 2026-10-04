# TODO

**Vision:** fetch all of NSE's cash-market data and build cash-market intelligence on it.
The NIFTY 50 breadth dashboard is the starting point, not the end state. Prefer designs
that scale to the whole market (thousands of symbols, all series).

Goals each item serves: (a) trading/decision aid, (b) research & learning, (c) nicer
product, (n) helping a beginner judge a stock. Within each section, highest priority first.
Why each finished item was built the way it was: `docs/decisions/`.

**Where we left off (4 Oct 2026, later).** Database check-up done (decision 0021): Postgres
tuned, nightly backup (restore tested), index on `daily_indicators(symbol, trade_date)`.
**Delivery % is collected** (`daily_delivery` since 28 Sep 2016, nightly) **and studied**
(research 0003): no delivery buy/sell signal passed; four real but small effects, all under
the cost bar. Next candidates: nightly warnings to the owner (Telegram/email, owner to pick),
website auto-restart, the breadth-thrust study (Signals). Backups go to this Mac and iCloud Drive. Check Monday's (5 Oct) nightly run (Ops): it
now also loads delivery and writes a backup.

---

## Next up

### Signals page (`/signals`, design handoff §3) — a
- [ ] **Study the breadth thrust first** (Zweig: 10-day advancing share < 40% → > 61.5%
  within 10 sessions). Designed for thousands of NYSE stocks; with 50 it may fire too
  often. Same method as research 0001. Build only if it holds up.
- [ ] **Study the divergence first** (index near its 250-session high while breadth fell
  ≥ Y pts over 60 sessions). Decide X and Y from the study. Index closes exist
  (`index_prices`).
- ~~"Overbought" from breadth > 80%~~: research 0001 found no edge, so don't build.

### Beginner tools (from the 2026-10-02 product review) — n
- [ ] **Market Weather**: one plain-language verdict (Healthy / Mixed / Stormy) combining
  breadth, A/D, McClellan and research 0001's "what happened next". Mostly built from
  existing data. Add index P/E, P/B and dividend yield (already in `index_prices`' source
  file) for "is the market expensive?".
- [ ] **Strength Leaderboard**: stocks and sectors ranked by relative strength vs the NIFTY
  50 (3/6/12 months), with trend and liquidity filters. **Study momentum first** (does
  the top ranked third beat the index over 3–6 months in our data?).

### More indicators (from the 2026-10-02 indicator brainstorm)
The beginner Report Card lights came first (done: 0014); these follow.
- [ ] **Signal track records (trader)** — a: RSI, breakouts, 52-week highs… each shown with
  its own history on that stock: how many times it fired, what happened N sessions later,
  against the base rate of any random day. Always show the sample size; say "too few
  occasions" under a minimum (data-snooping guard). Same method as research 0001.
- [ ] **Factor leaderboard (whole index)** — n: rank members by momentum (12-1), low
  volatility and closeness to the 52-week high, like NSE's Momentum / Low Volatility indices
  (we store those indices: compare). Overlaps the Strength Leaderboard above: merge them.
- [ ] **Diversification / "moves with"** — n: correlation between members; "owning HDFCBANK
  and ICICIBANK isn't diversifying". Needs a portfolio input or a pick-two view.
- [ ] **Strength within its sector** — n: needs the sector tag (Data to add); sector index
  closes are already stored.

### Notifications — a
- [ ] **Nightly digest** (old item 6): after the nightly run, send a summary of breadth
  changes, new crossings and signals.
- [x] Run `bun run audit:report-card` after the nightly ingest (done 4 Oct; its `✗` lines are nightly `WARNING`s, decision 0013). Delivering them is the item below.
- [ ] **Deliver the nightly `WARNING` lines** (unparsed corporate action, unexplained
  jump, NIFTY 50 changed, feed not updated). Today they only go to
  `~/Library/Logs/tradesence-nightly.log` and nobody sees them (docs/pipelines.md §6).
  Email, Telegram or a phone notification.

---

### Volume (from research 0002) — a, b, c
Research 0002 tested 15 volume signals on the NIFTY 50 since 2020; none beat random days.
- ~~A: market-wide volume alarm (90% days, up-volume share)~~: no edge. Optional: show
  up-volume share on Advance/Decline as plain context, never as a signal.
- ~~B: Report Card volume light (CMF / MFI / OBV)~~: no edge (low CMF came closest; re-check
  when more data or the whole market is tested).
- ~~C: Screener volume-confirmed breakouts~~: heavy-volume crossings were no better than
  light ones. The existing "Volume vs 20d" column stays as information.
- [ ] Re-run research 0002 on the whole NSE market once averages exist for every stock
  (Broader universes), and add delivery % (Data to add) as a test. **First** replace the
  luck check's random stock-days with random *dates* (one random member per date), because
  signals bunch up; record that in `docs/decisions/` (research 0002 caveats).

---

## Explain-terms polish (deferred from the decision 0012 review) — n
- [ ] Crossings page "Calmest"/"Median" tiles include ex-members (YESBANK, 0 crossings):
  rank today's members by rate, as `/learn/whipsaw` now does.
- [ ] Popover "Today:" on a past date (`?date=`) should name the session ("On 23 Mar 2020:").
- [ ] `/learn/ema`: add a live example (KOTAKBANK's 200 EMA).
- [ ] Bigger ⓘ tap target on phones (16 px now; 24 px minimum); cap popover height in landscape.
- [ ] Live examples: share `NEAR_PCT` and the index name; log errors instead of hiding them;
  breadth-thrust sentence should say whether a thrust fired.
- [ ] Learn pages keep the reader's average (`ma`) instead of resetting to the 200 SMA.


## Report Card lights polish (deferred from the decision 0014 review) — n
- [ ] A figure can round onto the wrong side of a cut-off: INFY shows "Amber 1.0×" (Right now).
  Show two decimals near a cut-off, or compare the rounded value.
- [ ] Bad days sentence: "it" is ambiguous ("When the NIFTY falls 1%, it usually falls…"),
  and "usually" should be "on average" (also in the glossary and live example).
- [ ] Only the latest of two overlapping ongoing crashes is mentioned; make `ongoing` a list.
- [ ] Crash table says "Not yet" also when a data gap (not time) leaves "back" unknown.
- [ ] Audit: also compare the three new lights' colours, `weekPct`, `capture.sessions`, `backOf`.
- [ ] RiskMetrics seed is a demeaned sample variance while the recursion is zero-mean
  (negligible after ~100 sessions; note or switch to mean of squares).
- [ ] "Right now" can light ~20 sessions after a long suspension (σ seeded on 20 moves):
  also require ~60 moves in the current segment.
- [ ] Capture pairs a multi-session stock move after a short gap with a one-session NIFTY
  move (latent: no NIFTY 50 case since 2020; matters for the whole market).
- [ ] `breadthSeries` is recomputed on every Report Card view (~120 ms): cache by latest date.
- [ ] Glossary wording: say a crash fall is capped at 0; "up to 1.5× jumpier" → "up to 1.5× as jumpy".

## Report Card polish (deferred from the decision 0011 review) — n
- [ ] The membership line ignores the chosen date: ETERNAL read in 2023 says "In the
  NIFTY 50 since 28 Mar 2025". Phrase it relative to the session shown.
- [ ] The horizon resets when stepping sessions after switching it in the calculator
  (prev/next links keep the server-rendered `h`).
- [ ] Show the median outcome in the calculator. Annotate peak and recovery (not only the
  trough) on the "how far below its high" chart.
- [ ] Events: de-duplicate actions filed under both an old and a new symbol, and bound
  old symbols to their own dates, as `computeIndicators` does.
- [ ] Optional extra checks: delivery % (collected, `daily_delivery`; study first) and valuation.

## Data to add — a, b, n
- [x] **Delivery %** (collected 4 Oct, decision 0021): shares bought *and kept* ÷ shares
  traded, per stock per day, in `daily_delivery` since 28 Sep 2016. Notes from the checks:
  - Source: NSE's security-wise delivery file
    `nsearchives.nseindia.com/archives/equities/mto/MTO_DDMMYYYY.DAT`, one format from at
    least 2012 to today (28 Sep 2016 and 1 Oct 2026 both exist). Rows `20,<sr>,SYMBOL,SERIES,
    traded qty,deliverable qty,deliv %`; the trade date is in the header line.
  - `sec_bhavdata_full_DDMMYYYY.csv` has the same numbers (`DELIV_QTY`, `DELIV_PER`; INFY
    51.96% on 1 Oct 2026 in both) but only from ~2019 (Oct 2018 is a 404, Oct 2019 exists).
  - [x] **Studied** (research 0003, 4 Oct): 8 signals on the whole liquid market, decided
    on 2016–22 and confirmed on 2023–. None Build. ~~Delivery buy/sell signal, accumulation
    alert, delivery-spike screener~~: no edge worth trading (the up-day spike even lagged).
  - [ ] Maybe, owner's call: a stock's typical delivery level ("mostly held" vs "mostly
    traded") on the Report Card as information only, with a glossary entry; ideally after a
    3-month study, since the gaps grew with time (1.1 and 1.5 points at 3 months).
- [ ] **Sector tag for every stock**, from NSE's sector-index constituent files. Needed for
  sector rotation and the leaderboard.
- [ ] **Company names**, for the Report Card and the stock list.
- [ ] **NIFTY 50 membership 2016–2019** (optional): same press-release method as decision
  0005; then move `HISTORY_START` back.

## Broader universes (old item 7) — b, c
Prerequisites first, or whole-market numbers will be wrong:
- [ ] ETF unit splits: not in NSE's equities corporate-actions feed (decision 0002 gaps).
- [ ] Corporate actions for renamed companies outside the NIFTY 50: NSE files them under
  the new symbol (decision 0003).
- [ ] Compute `change_pct`, `vol_ratio`, `turnover` and the averages for every symbol,
  not only index members (today ~50 of ~2,900).
- [ ] Membership for NIFTY 500 / other indices. It changes too often for a hand-kept file
  (decision 0005), so it needs an automatic source.
- [ ] Then: % above 200 DMA for NIFTY 500 / whole market, and its divergence from the
  NIFTY 50.
- [ ] Optional intraday: NSE's live `/api/live-analysis-*` endpoints use the last traded
  price, not the official close, and give today only. Good for a "today so far" tile, not
  for history.

## Nice-to-haves (old item 8) — c
- [ ] Density follow-ups (decision 0020 review): holding `d` (or `t`) flips on every key repeat
  (`if (e.repeat) return;` in Hotkeys); the phone top bar's two icon toggles need `shrink-0`;
  the spec's token table still says `--spacing-cell-y` / `--chart-scale` (code: `--density-*`).
- [ ] Page cross-fades: React's `<ViewTransition>` never started here (decision 0015). Retry when Next.js documents it working for pages that render their own sidebar, or move `SiteNav` into the layout first.
- [ ] Motion polish (decision 0015 review): the pill should re-measure when option labels change width; `−₹` figures can't count; hover on the breadth histogram eases 300 ms; rename `.fade-in` (clashes with tw-animate-css); the pill's 8 px radius has no token; behaviour tests for no-JS and reduced motion.
- [ ] Learn pages: small diagrams for SMA vs EMA and for a drawdown (decision 0012).
- [ ] Volume/turnover anomalies vs the 20-day baseline (`vol_ratio` exists now).
- [ ] New 52-week highs vs lows. Apply the split/bonus/demerger adjustment
  (`change_pct`) and the lineage, as the Report Card does.
- [ ] Split/bonus history per stock: **partly done**, since the Report Card's Events card
  shows it. The owner may still want it elsewhere.

## Ops
- [ ] **Twice a year (next ~31 Mar 2027):** update `src/ingest/nifty50-history.csv`
  after NSE's rebalance. The nightly log warns, and `tests/nifty50-history.test.ts`
  fails on purpose. Steps in decision 0005.
- [ ] **Server deployment**: first check NSE answers from the server's IP (it blocks some
  cloud addresses), then replace the launchd job with cron or systemd (decision 0001).
  If NSE blocks it, add a broker-API fallback (offered: Groww/broker). Check whether its
  history is split-adjusted first.
- [ ] Start the dashboard server automatically (a second launchd agent locally, or a
  process manager on the server).
- [x] Checked the nightly log on 3 Oct 2026: the 2 Oct 19:30 run finished cleanly (holiday detected, corporate actions and renames refreshed, averages recomputed). Check again after the first trading-day run (Mon 5 Oct).

---

## Done (details in docs/decisions/ and docs/research/)
- [x] Nightly job scheduled (launchd, Mon–Fri 19:30 IST): 0001
- [x] Splits and bonuses adjusted (NSE corporate-actions feed): 0002
- [x] Renamed stocks keep their history: 0003
- [x] Demergers adjusted (price-derived ratio, matches TradingView): 0004
- [x] Real NIFTY 50 membership since 2020 (survivorship fix; old item 1): 0005
- [x] NIFTY 50 index closes stored (every NSE index): 0006
- [x] Weekend trading sessions loaded: 0007
- [x] Forward-return study, does breadth predict (old item 2): research 0001
- [x] Advance/Decline page (old item 3): 0008
- [x] Screener page (old item 5): 0009
- [x] shadcn date picker: 0010
- [x] Stock Report Card + Risk Calculator: 0011
- [x] Every term explained: ⓘ popovers + `/learn` pages: 0012
- [x] Independent Report Card audit; Strength rank and flat-month rounding fixed: 0013
- [x] Report Card lights 6–8 (Right now, Bad days, In crashes): 0014
- [x] App motion (polished and smooth): 0015
- [x] UI density: compact by default, comfortable on `d`, remembered per browser: 0020
- [x] Signals page: breadth washout alarm, what happened next, every episode: 0017
- [x] Does volume tell us anything? 15 signals, none beat random: research 0002
