# TODO

**Vision:** fetch all of NSE's cash-market data and build cash-market intelligence on it.
The NIFTY 50 breadth dashboard is the starting point, not the end state. Prefer designs
that scale to the whole market (thousands of symbols, all series).

Goals each item serves: (a) trading/decision aid, (b) research & learning, (c) nicer
product, (n) helping a beginner judge a stock. Within each section, highest priority first.
Why each finished item was built the way it was: `docs/decisions/`.

---

## Next up

### Signals page (`/signals`, design handoff §3) — a
- [ ] **Breadth washout alert**: 200-SMA breadth < 20%, shown with its history
  (research 0001: index higher 6 months later in 5 of 5 episodes, but a small sample).
  Status Active / Watching / Quiet, last fired, times fired since 2020.
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

### Notifications — a
- [ ] **Nightly digest** (old item 6): after the nightly run, send a summary of breadth
  changes, new crossings and signals.
- [ ] **Deliver the nightly `WARNING` lines** (unparsed corporate action, unexplained
  jump, NIFTY 50 changed, feed not updated). Today they only go to
  `~/Library/Logs/tradesence-nightly.log` and nobody sees them (docs/pipelines.md §6).
  Email, Telegram or a phone notification.

---

## Report Card polish (deferred from the decision 0011 review) — n
- [ ] Strength can read "stronger than 100% of the members": `percentRank` counts the
  stock itself. Rank among peers only, or say "Nth of M".
- [ ] The membership line ignores the chosen date: ETERNAL read in 2023 says "In the
  NIFTY 50 since 28 Mar 2025". Phrase it relative to the session shown.
- [ ] The horizon resets when stepping sessions after switching it in the calculator
  (prev/next links keep the server-rendered `h`).
- [ ] Show the median outcome in the calculator. Annotate peak and recovery (not only the
  trough) on the "how far below its high" chart.
- [ ] Events: de-duplicate actions filed under both an old and a new symbol, and bound
  old symbols to their own dates, as `computeIndicators` does.
- [ ] Optional extra checks: delivery % (needs the full bhavcopy, below) and valuation.

## Data to add — a, b, n
- [ ] **Delivery %**: NSE's full bhavcopy (`sec_bhavdata_full`) has delivered quantity
  per stock per day. A conviction signal for the Screener and Report Card.
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
- [ ] Check the first automatic nightly runs: `tail ~/Library/Logs/tradesence-nightly.log`.

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
