# tradeSence

**NIFTY 50 market-breadth tracker.** Shows how many index constituents trade above
their 200-day SMA, 200-day EMA and 50-day SMA — and charts that percentage over
ten years, because a single reading means nothing without its own history.

Data comes from free, public NSE bhavcopy archives. **No broker account, no API
key, no subscription.**

## Setup

```bash
brew services start postgresql@14
createdb tradesence && createdb tradesence_test
bun install
bun run db:migrate
DATABASE_URL=postgres://localhost:5432/tradesence_test bun run db:migrate
```

## Load data

```bash
bun run ingest:nifty50 2016-09-01               # seed index membership
bun run ingest:backfill 2016-09-28 2026-09-25   # ~2,600 files, ~40 min
bun run indicators                              # compute moving averages
bun run dev                                     # http://localhost:3000
```

## Keep it current

`bun run ingest:nightly` re-ingests the last week and recomputes. Every step is
idempotent, so a missed night heals on the next run. Schedule it after ~7pm IST,
once NSE has published the day's bhavcopy:

```cron
30 19 * * 1-5 cd /path/to/tradeSence && /opt/homebrew/bin/bun run ingest:nightly >> /tmp/tradesence.log 2>&1
```

## Caveat

The ten-year chart is survivorship-biased: membership is seeded with today's 50
names. See the "Known limitation" section in `AGENTS.md`.
