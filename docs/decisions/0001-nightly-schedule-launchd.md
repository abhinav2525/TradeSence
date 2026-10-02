# 0001 — Schedule the nightly job with launchd

**Date:** 2026-10-02 · **Status:** done

## Problem

The nightly ingest (`bun run ingest:nightly`) worked, but nothing ran it. Data only
refreshed when someone remembered to run it by hand, and on 2026-10-01 the dashboard
was a trading day behind (2026-09-30 missing).

## Options

| Option | Good | Bad |
|---|---|---|
| **cron** (`crontab -e`) | Standard, one line | On a Mac, a run missed while the laptop sleeps is simply skipped |
| **launchd agent** (macOS's own scheduler) | A run missed during sleep fires on wake | A plist file instead of one line |
| Keep running it by hand | Nothing to set up | Already failed once |

## Decision

A launchd agent, `com.tradesence.nightly`, runs `ingest:nightly` **Mon–Fri at 19:30
IST** (NSE publishes bhavcopy around 17:45). Files: `ops/com.tradesence.nightly.plist`
and `ops/install-nightly.sh`. Log: `~/Library/Logs/tradesence-nightly.log`.

## Why

- The machine is a laptop. Sleep at 19:30 is normal; launchd still runs the job on
  wake, cron does not.
- The job re-ingests the last 7 days, so even a night the Mac was fully off heals
  on the next run. No retry logic needed.
- `WorkingDirectory` points at the repo so bun picks up `.env` — without it the job
  would silently use the default database URL.

## Revisit when

The app moves to a server (planned). Use the server's scheduler (cron or systemd
timer) there — sleep is not an issue on a server. **First check that NSE answers
from the server's IP**: NSE is known to block some cloud/datacenter addresses. If it
does, see the broker-API fallback noted in [0002](0002-split-adjusted-averages.md).
