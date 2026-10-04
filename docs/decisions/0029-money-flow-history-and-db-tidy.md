# 0029 — Money flow history, and tidying the database behind it

**Date:** 2026-10-05 · **Status:** done · Spec: [history](../superpowers/specs/2026-10-05-money-flow-history-design.md) · Plan: [plan](../superpowers/plans/2026-10-05-money-flow-history.md)

## Problem

1. The Money flow page only showed this week (or day, or month). The owner wanted to see
   whether a busy sector is a one-off or a build-up over months.
2. The owner asked to "make sure the db is sorted". A check found three things:
   - **Stale activity counters:** Postgres's own counters said `daily_prices` had 0 live rows
     (it has 4.75 million) and `ingest_log` 2 (it has 2,627). These counters are what
     Postgres's automatic upkeep (autovacuum, which also refreshes query-planning statistics)
     uses to decide when to act; they are wiped after a crash or a forced shutdown. With
     them at 0, and the trigger at ~10% of a table changing (~475,000 rows for
     `daily_prices`, about 200 sessions), the big tables could go months without a refresh.
   - **A key in the wrong order:** `money_flow`'s primary key was (symbol, period), but the
     page always reads one period.
   - **Work on every page view:** the short-session check summed `daily_prices` across 750
     stocks on each view (~80 ms).

## Decisions

| Choice | Decision | Why |
|---|---|---|
| History span and step | 52 weeks, weekly | Daily is too jumpy to read; monthly hides turns |
| Same rule as the bars | Week k = sessions 5k…5k+4, normal = 63 sessions before it; week 0 = today's 1-week bar | The chart's last point must equal the bar; one shared calculation (`windowStat`) does both |
| Storage | `sector_flow_weeks`, keyed (sector, week_end) | Exactly the page's read: one sector, in week order. ~1,000 rows |
| Short sessions | Found nightly into `short_sessions` | The page reads a tiny table instead of summing millions of rows per view |
| `money_flow` key | (period, symbol) | Matches the read |
| Statistics | `ANALYZE` once now; the nightly job now runs `ANALYZE` on the big raw tables (`daily_prices`, `daily_delivery`, `index_prices`, `ingest_log`) and every table it rebuilds in full (`src/db/maintenance.ts`) | Automatic upkeep may not reach them for months; ANALYZE samples ~30,000 rows, so it costs under a second |
| Memory | Each stock's history trimmed to the ~1.5 years the weekly pass needs before it's kept | Keeps the nightly job's memory small |

## Result (measured)

Both reads were already well under a millisecond (these tables are small); the real gains are
the short-session check leaving the page view, and statistics that stay current.

| Page read | Before | After |
|---|---|---|
| Money flow rows for one period | sequential scan, 0.58 ms | primary-key scan, 0.37 ms |
| A sector's history | (new) | primary-key scan, 0.05 ms |
| Short sessions in the window | ~80 ms (sum over `daily_prices`) | 0.007 ms |

Week 0 of Metals & Mining is 0.9301×, −4.95%: the same as its 1-week bar and the independent
SQL check in 0028. The nightly build found one short session in the period: 21 Oct 2025, the
Diwali Muhurat evening (₹15,817 crore traded against a usual ₹82,610 crore); its week is ringed.

## Found by the independent review (fixed)

The first version refreshed statistics only for the small rebuilt tables, not the big raw
ones where the stale counters actually showed. The nightly list now covers both, and a test
checks it (`tests/maintenance.test.ts`). It also corrected this file's explanation of what
the stale counters affect.

## Something we found along the way

The "on an empty database every glossary example is empty" test didn't clear `money_flow`
(since 0028), so leftover rows from another test made it fail. Fixed in the test's setup.

## Limits

The history uses today's ~750 stocks and sectors for the whole year, stated under the chart.

## Revisit when

Someone wants longer history (the table holds 52 weeks by design), or per-stock history.
