# TODO

Roadmap from the 2026-09-30 brainstorm. Goals: (a) trading/decision aid,
(b) research & learning, (c) nicer product. Ordered highest priority first —
each item unlocks or de-risks the ones below it.

## 0. Install the nightly cron — all
- [x] Schedule `bun run ingest:nightly` — launchd agent, Mon–Fri 19:30 IST,
  installed 2026-10-02 via `ops/install-nightly.sh`.

## 1. Survivorship fix: historical NIFTY 50 membership — a, b
- [x] **Done 2026-10-02, from 2020 onward** — docs/decisions/0005.
- [x] **Spike:** can we get reliable, machine-readable NIFTY 50
  additions/removals for 2016→today?
  - Sample niftyindices.com monthly archives and niftyhistory.in.
  - Cross-check against known changes (e.g. Adani Enterprises / Shriram
    Finance added; Vedanta / Zee dropped).
  - Output: which source, what format, how complete. No repo changes.
- [x] Loader (bounded task, own approval): insert closed intervals into
  `index_members`. No schema change — `breadthSeries` already evaluates
  membership per date.
- [x] Renamed symbols lose pre-rename history (TATACONSUM, SHRIRAMFIN,
  ETERNAL) — fixed with NSE's symbolchange.csv, docs/decisions/0003.

Why first: every later item reads the 10-year history, which today is computed
on current winners and flatters any backtested signal.

## 2. Forward-return study: does breadth predict? — b → a
- [x] When % above 200 DMA was < 20% (or > 80%), what did NIFTY 50 do over the
  next 1 / 3 / 6 months? **Done 2026-10-02** — docs/research/0001. Below 20%:
  higher 6 months later 5/5 times (+14% avg vs +7.7% normal), but a small sample.
  Above 80%: no edge.

## 3. Advance/Decline line + McClellan oscillator — c, a
- [x] **Done 2026-10-02** — `/advance-decline` page (decision 0008). Built from the
  adjusted daily move, not `prev_close` (wrong on split days). Found and fixed 10
  missing weekend sessions on the way (decision 0007).

## 4. Signal detectors — a
- [ ] Breadth washout: 200-SMA breadth < 20%, shown with its history (research 0001
  says this is the one worth building).
- [ ] Breadth thrust (Zweig: < 40% → > 61.5% within 10 days) — **study it first**,
  same code as research 0001.
- [ ] Divergence: index at new high while breadth is falling — study first; index
  closes now exist (`index_prices`).
- ~~"Overbought" from breadth > 80%~~ — research 0001 found no edge; don't build.

## 5. Screener — a, c
- [x] **Done 2026-10-02** — `/screener` (decision 0009): crossed above/below any
  average with a volume filter (default ≥2×), and "near the line" lists.

## 6. Nightly digest — a
- [ ] After ingest, push a summary of breadth changes, new crossings and
  signals from items 4–5.

## 7. Broader universes — b, c
- [ ] % above 200 DMA for NIFTY 500 / whole market; show divergence from
  NIFTY 50. Query-only — `daily_prices` already holds the whole market.

## 8. Nice-to-haves — c
- [ ] Relative-strength ranking vs index.
- [ ] Volume/turnover anomalies vs 20-day baseline.
- [ ] New 52-week highs vs lows — split/bonus factors now exist in
  `corporate_actions` (docs/decisions/0002); apply them to highs/lows too.
- [ ] Show split/bonus history per stock — data is in `corporate_actions`;
  **owner will say where it goes in the UI**.
