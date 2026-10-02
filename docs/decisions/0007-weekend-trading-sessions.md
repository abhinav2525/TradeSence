# 0007 — Load weekend trading sessions

**Date:** 2026-10-02 · **Status:** done

## Problem

Found while checking the new Advance/Decline numbers against NSE's own `prev_close`. On
a few Mondays, nearly every stock's `prev_close` (what NSE says the previous close was)
didn't match the previous close we had stored. On 2 Feb 2026 RELIANCE's `prev_close` was
₹1,347, but our previous session said ₹1,395.40.

**Cause:** NSE sometimes trades on a **Saturday or Sunday**, and our downloader skipped
weekends to save requests. Ten sessions since 2016 were never loaded:

| Missing session | What it was |
|---|---|
| Sun 30 Oct 2016, Sun 27 Oct 2019, Sat 14 Nov 2020, Sun 12 Nov 2023 | Diwali Muhurat trading |
| Sat 1 Feb 2020, Sat 1 Feb 2025, Sun 1 Feb 2026 | Union Budget day |
| Sat 20 Jan 2024, Sat 2 Mar 2024, Sat 18 May 2024 | NSE special sessions (disaster-recovery tests) |

**Effect:** those days were missing from every average and every chart. The day after
each one also showed a two-day move as if it were one day.

**How they were found:** for every day, count how many stocks' `prev_close` disagrees
with our previous stored close. On a normal day that's a handful (corporate actions).
On the day after a missing session it's ~95% of the market. That gave exactly these
10 dates.

## Options

| Option | Good | Bad |
|---|---|---|
| **Fetch every calendar day, weekends included** ✅ | Simple, and catches every future weekend session automatically (the next Budget Sunday, the next Muhurat) | ~2 extra requests a night; a fresh 10-year backfill takes ~30% longer |
| Detect missing sessions from `prev_close` and fetch only those | No wasted requests | More logic, and it only notices a missed session *after* the next trading day |
| Keep a list of special sessions by hand | No extra requests | Someone has to remember every Budget day and Muhurat session |

## Decision

`daysBetween` (in `src/ingest/backfill.ts`, formerly `weekdaysBetween`) now returns
**every calendar day**. An ordinary weekend has no file, so it's recorded as a holiday,
using the same rules as any exchange holiday (provisional for 2 days, then settled). The
10 missing sessions were loaded with `bun run ingest:day`, along with their index closes.

## Why

- **Correct by default.** The cost is a few requests a night, and in return no special
  session can ever be missed again. Hand-kept lists and detection both fail quietly.
- **Nothing new to maintain.** Weekends reuse the holiday rules that already exist.

## Result

- After the fix, **0 days** have a `prev_close` pointing to a session we don't have.
- A live test checks that NSE really publishes Sunday 1 Feb 2026 (Budget), and that an
  ordinary Sunday is a holiday.

## Revisit when

- Never needed for correctness. If request volume ever matters (e.g. NSE rate-limits a
  server), switch to the detection option. This query lists any day whose `prev_close`
  points to a session we don't have (it should return nothing):

```sql
with s as (
  select symbol, trade_date, prev_close,
         lag(close) over (partition by symbol order by trade_date) as our_prev
  from daily_prices where series = 'EQ'),
d as (
  select trade_date, count(*) n,
         count(*) filter (where abs(prev_close / our_prev - 1) > 0.0005) mismatch
  from s where our_prev is not null group by 1)
select trade_date from d where mismatch > 0.5 * n and n > 100;
```
