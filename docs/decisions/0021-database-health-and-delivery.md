# 0021 — Database check-up, and where delivery % lives

**Date:** 2026-10-04 · **Status:** done

## Problem

Before adding delivery % (another ~5 million rows), the owner asked for a senior-level
look at the database: is it built to store and read this much data efficiently?

What was measured (4 Oct 2026):

| Table | Rows | Size |
|---|---|---|
| `daily_prices` | 4.75 million (3,918 stocks × 2,482 days since 28 Sep 2016) | 884 MB (472 MB data, 412 MB indexes) |
| `index_prices` | 242,000 | 35 MB |
| `daily_indicators` | 158,000 (only the 66 stocks ever in NIFTY 50) | 34 MB |
| everything else | ~26,000 | 10 MB |

Every page query was fast (one stock's history 11 ms, the whole breadth chart 92 ms).
The design itself (store everything, filter when reading; one row per stock per day)
is sound and was kept. Four problems were found:

1. **Postgres was on factory settings.** Homebrew's defaults: 128 MB of memory for a
   900 MB database on an 18 GB Mac, 4 MB per sort. The breadth query already spilled
   its sort to disk.
2. **No backup.** One local database. Prices can be re-downloaded (~28 min), but
   delivery, corporate actions and index closes add hours, and NSE could remove old
   files.
3. **One stock's history is scattered on disk.** Rows are stored in arrival order (one
   day of all stocks at a time), so a stock's 2,482 days sat on 2,464 different 8 KB
   pages: nearly one disk read per row. Postgres reports it directly: the physical order
   follows `trade_date` perfectly (correlation 1.0) and `symbol` not at all (0.0).
4. **`daily_indicators` had no index for "one stock over time".** Its key is
   (date, stock), which serves breadth ("every stock on a day"), but the Report Card
   ("one stock, every day") read the whole table. Harmless at 66 stocks; at the whole
   market (planned) it would read ~5 million rows per page view.

## Options and decisions

**1. Settings.** Applied with `ALTER SYSTEM` (kept in `ops/postgres-tuning.sql` so a new
machine gets the same): `shared_buffers` 2 GB, `effective_cache_size` 8 GB, `work_mem`
32 MB, `maintenance_work_mem` 512 MB, `random_page_cost` 1.1 (it's an SSD). Postgres
was restarted; the live site on :3000 reconnected by itself (checked: 200s).

**2. Backup.** `ops/backup.sh` (`bun run db:backup`), run as the last step of the nightly
job: one compressed `pg_dump` (145 MB in 13 s before delivery; 192 MB with it), newest 7 kept, written under a temporary
name and renamed so a half-written dump is never kept as good. **Restore was tested**:
restored into a scratch database, row counts matched table for table, scratch dropped.
It goes to `~/Backups/tradesence` on the same disk, which covers mistakes (a bad
migration, a dropped table) but not the disk dying. Set `TRADESENCE_BACKUP_DIR` to
iCloud Drive or an external disk for that; the owner's call.

**3. Scattered history: not fixed yet, on purpose.** 11 ms is fine today. The fix when
it matters (whole-market averages: 3,900 histories in a row) is a one-time `CLUSTER`
on `daily_prices_symbol_date_idx`, which rewrites the table grouped by stock (about a
minute, no extra disk). A covering index was rejected: it would roughly double the
table's disk use and slow every nightly write. Measure before and after when the time
comes.

**4. Index added:** `daily_indicators_symbol_date_idx` on (symbol, trade_date). The
Report Card query now uses it instead of reading the table.

**Delivery % gets its own table, `daily_delivery`**, not new columns on `daily_prices`:

- It's a separate NSE file that can be late or missing on a day the prices exist.
- In Postgres, changing a row writes a whole new copy of it. Filling new columns for
  4.75 million existing rows would double `daily_prices` until vacuum cleaned up.
- Same key (date, symbol, series), so joining the two is a cheap key lookup.

It stores `traded_qty` and `deliverable_qty`, not the percentage: the percentage is one
division away, and NSE's copy is rounded to two decimals. Source is `MTO_DDMMYYYY.DAT`,
one format since at least 2012; `sec_bhavdata_full` was rejected because it starts only
in ~2019. Traded quantity matches bhavcopy volume exactly (INFY 1 Oct 2026: 15,166,446
in both; 20MICRONS 28 Sep 2016: 174,582 in both). Backfilled from **28 Sep 2016**, the
start of price history (owner's choice), because the whole-market study needs the years.

Like index closes, it fetches only days the price step logged as trading days, so the
holiday rules exist once. A day counts as done when it has rows, so each day's rows go
in one transaction: a crash mid-day leaves nothing, and the day is fetched again.

Things the file does that the code handles:

- The column header names six fields but every row has seven (the series sits, unnamed,
  after the symbol). Rows are read by position and the header is checked **field by
  field at those positions**. A plain "does the header mention it" check was tried
  first, and its test caught that "Deliverable Quantity" also appears inside the %
  column's name, so a lost column would have gone unnoticed.
- **The readable date line has typos**: 30 Mar 2017 (and at least 25 Oct and 30 Nov
  2017) says `rade Date <…>`, and the first backfill attempt failed those days. The file
  has a better source: line 2 is a machine-readable summary record,
  `10,MTO,30032017,1186404929,0001623`, holding the date, the **total delivered shares**
  over every row, and the **number of rows**. The date now comes from there, and both
  totals are checked: a download cut short, or a row misread, no longer adds up and the
  day fails. Checked on four files from 2016 to 2026; both totals matched every time.
  The first backfill (393 days, loaded before this check existed) was cleared and re-run
  so every stored day passed it.
- No BE rows: BE stocks settle trade-for-trade, so every share is delivered, and NSE
  leaves them out.
- A kept row with an unreadable or impossible number (delivered > traded) fails the
  whole day loudly rather than storing a guess.

**Deliberately not done:** partitioning by year (Postgres handles 100M+ rows; we add
~470k a year), numeric IDs instead of symbols (~5% smaller, much harder to read, messier
renames), a time-series database (another moving part for a size plain Postgres
handles).

## Growth

| | Size |
|---|---|
| Before | 0.9 GB |
| + delivery since 2016 | 1.57 GB (`daily_delivery` is 590 MB) |
| + averages for the whole market (planned) | ~2.3 GB |
| + 10 more years | ~4.5 GB |

## Backfill result

Run 4 Oct 2026, about 22 minutes: **all 2,482 trading days from 28 Sep 2016 to 1 Oct
2026, 4.32 million rows, 3,760 stocks.** Every day passed both summary checks. One day
(12 Oct 2018) first failed them: NSE's summary leaves out a single row in series X2
(`IBVENTURES`), so its count is one short and its total short by exactly that row's
191,918 shares. The check now tolerates exactly that case, one left-out row of a series
we don't store, and nothing else; the day then loaded.

**Cross-check against bhavcopy:** 4,317,260 of 4,317,261 EQ price rows have a delivery
row, and on 2,477 of the 2,482 days traded quantity equals bhavcopy volume for every
stock. On five days it doesn't, for most stocks at once:

| Day | Stocks differing | Delivery file's traded ÷ bhavcopy volume |
|---|---|---|
| 17 Jun 2019 | 1,236 | 1.11 |
| 18 Jun 2019 | 1,244 | 1.12 |
| 4 Sep 2023 | 2 | 1.00 |
| 21 Oct 2025 (Diwali Muhurat session) | 748 | 1.00 |
| 11 Sep 2026 | 2,584 | 0.86 |

TradingView agrees with bhavcopy (COLPAL on 11 Sep 2026: 280,878 shares in both; the
delivery file says 258,866). So on these days the delivery file covers a different set
of trades than the full day. The rows are kept as NSE published them: delivery % uses
both numbers from the same file, so it stays consistent. **The delivery study should
leave these five days out** (or show it doesn't matter). Re-find them any time with:

```sql
select trade_date, count(*) from daily_delivery v
join daily_prices p using (trade_date, symbol, series)
where p.volume <> v.traded_qty group by 1 order by 1;
```

## Revisit when

- Whole-market averages are built: run `CLUSTER` (problem 3) and time it.
- The app moves to a server: re-tune the settings for that machine's memory, and
  point the backup off the machine.
