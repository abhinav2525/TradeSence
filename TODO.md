# TODO

Roadmap from the 2026-09-30 brainstorm. Goals: (a) trading/decision aid,
(b) research & learning, (c) nicer product. Ordered highest priority first —
each item unlocks or de-risks the ones below it.

## 0. Install the nightly cron — all
- [ ] Schedule `bun run ingest:nightly` (deferred to 2026-09-30).
  Without fresh data nothing else stays alive.

## 1. Survivorship fix: historical NIFTY 50 membership — a, b
- [ ] **Spike:** can we get reliable, machine-readable NIFTY 50
  additions/removals for 2016→today?
  - Sample niftyindices.com monthly archives and niftyhistory.in.
  - Cross-check against known changes (e.g. Adani Enterprises / Shriram
    Finance added; Vedanta / Zee dropped).
  - Output: which source, what format, how complete. No repo changes.
- [ ] Loader (bounded task, own approval): insert closed intervals into
  `index_members`. No schema change — `breadthSeries` already evaluates
  membership per date.

Why first: every later item reads the 10-year history, which today is computed
on current winners and flatters any backtested signal.

## 2. Forward-return study: does breadth predict? — b → a
- [ ] When % above 200 DMA was < 20% (or > 80%), what did NIFTY 50 do over the
  next 1 / 3 / 6 months? Decides which signals are worth building.

## 3. Advance/Decline line + McClellan oscillator — c, a
- [ ] From `close` vs `prev_close` per member per day. Cheap, standard, new
  instrument on existing data.

## 4. Signal detectors — a
- [ ] Breadth thrust (Zweig: < 40% → > 61.5% within 10 days).
- [ ] Divergence: index at new high while breadth is falling.
- Build only what item 2 says actually works.

## 5. Screener — a, c
- [ ] Crossed above 200 DMA today with ≥ 2× average volume; "closest to
  crossing" list.

## 6. Nightly digest — a
- [ ] After ingest, push a summary of breadth changes, new crossings and
  signals from items 4–5.

## 7. Broader universes — b, c
- [ ] % above 200 DMA for NIFTY 500 / whole market; show divergence from
  NIFTY 50. Query-only — `daily_prices` already holds the whole market.

## 8. Nice-to-haves — c
- [ ] Relative-strength ranking vs index.
- [ ] Volume/turnover anomalies vs 20-day baseline.
- [ ] New 52-week highs vs lows — **needs split/bonus adjustment first**
  (prices are unadjusted; splits read as fake crashes).
