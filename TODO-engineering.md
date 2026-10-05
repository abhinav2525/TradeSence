# Engineering roadmap: speed, architecture, system design (the lead engineer's list)

Kept by the `lead-engineer` agent. Items wait here until the owner picks one; a picked item
moves to `TODO.md` (the main list) and this file keeps a "→ picked, <date>" note.

Separate from `TODO.md` (features) on purpose. This list is about making the system itself
better: faster, simpler, safer to run, and using the right tool for each job. Every item
carries a **measured starting point** and a **trigger**, so we act on numbers, not feelings.
Owner's ask (5 Oct 2026): "fast, best architecture, system design, language efficiency."

## Where we stand (measured 5 Oct 2026)

| Thing | Now | Fine until |
|---|---|---|
| Database size | 1.6 GB (prices 884 MB, delivery 590 MB; +~250 MB/year) | ~50 GB on this disk |
| Nightly run (all steps) | **not measured**: the log records no timings (add the `step()` helper) | 30 min (would run into the evening) |
| Full price backfill | ~28 min, limited by NSE's servers | n/a (one-off) |
| Research study (2.3M stock-days) | 75 s | 10 min |
| Page reads (Money flow, breadth) | < 1 ms, by primary key | 50 ms |
| Test suite | 613 tests, ~9 s | 60 s |
| Memory, nightly | peaks ~640 MB (money flow pass) | 2 GB |

## 1. Speed

- [ ] **One pass over the stock histories per night.** Unusual activity, breadth, Top volume and
  Money flow each load the histories separately (4 passes, ~7,500 loads a night; lead engineer,
  5 Oct: not yet worth tying them together). Load once, hand the history to each
  step. Saves ~30 s a night and a third of the memory. *Trigger:* any new step that loads
  histories again.
- [ ] **Use every CPU core for the per-stock steps.** Bun runs them on one core; the Mac has
  several. Split the symbol list across workers. ~4–8× on the compute part. *Trigger:*
  nightly compute past 5 min.
- [ ] **Push aggregation into Postgres** where it's cheaper than loading rows into
  TypeScript (sector sums, counts above an average). Postgres is C; our loops are not.
  *Trigger:* a step that reads > 1 M rows into memory.
- [ ] **DuckDB / Parquet for research.** Columnar store reads billions of rows a second on a
  laptop and can read Postgres directly. *Trigger:* a study over 10 min, or any per-tick data.
- [ ] **Rust (or similar) only for intraday/tick data** (one day of ticks > our whole 10-year
  database). Not before. See the brainstorm note of 5 Oct.

## 2. Architecture

- [ ] **Derived tables, one pattern.** `unusual_days`, `volume_leaders`, `money_flow`,
  `sector_flow_weeks`, `breadth_daily` each have their own compute + CLI + nightly step +
  ANALYZE entry. Pull the shared shape (sessions, universe, histories, write, stats) into one
  small framework so a new derived table is ~50 lines, not ~150.
- [x] **Keys match reads everywhere.** Money flow and breadth tables (0029, 0030); the lead
  engineer confirmed `daily_indicators` and `unusual_days` already have the right indexes (5 Oct).
- [ ] **Universe and membership in one place.** Point-in-time NIFTY 50 (`index_members`),
  today's index lists (`index_constituents`), liquid companies (`liquidFlags`),
  ETFs (`fund_symbols`) are four different mechanisms. Document the map; consider one
  `universe(key, date)` function all pages call.
- [ ] **Page data budgets.** Keep every page under ~400 KB (0026); add a test that fails if a
  server component sends more rows than its table shows.

## 3. System design and operations

> **On hold (owner, 5 Oct 2026):** the owner is considering a **separate always-on server** for
> the nightly job and the site. Items that assume this Mac (phone notifications from here, the
> site restarting itself after a reboot, a local deploy command) wait for that decision; the
> lead engineer's proposal (`docs/proposals/2026-10-05-engineering-next.md`) stays valid either
> way, and the `step()` timing/isolation helper in the nightly job is worth doing regardless.
> Still true: three early nightly steps are unprotected (a crash there skips the backup).
> Also (5 Oct, 19:30 run): the log said `"error":3` but not *why*; the per-day failure reason must be
> logged (it was NSE still publishing; a manual re-run at 20:58 fetched the day). Part of the `step()` item.

- [ ] **Nightly warnings reach a human.** Today they only go to a log file. Telegram or
  email (owner's pick pending). Highest-value ops item.
- [ ] **Site restarts itself after a reboot** (a launchd agent for `bun run start`, like the
  nightly one). Today :3000 dies with a reboot and is restarted by hand.
- [ ] **Rebuild + restart in one command** (`bun run deploy:local`), so a merge reaches :3000
  without the manual kill/start dance.
- [ ] **Health check:** a tiny `/health` page (last session loaded, last nightly exit code,
  last backup time) and a once-a-day check that it answers.
- [ ] **Backup restore drill**, half done: a restore on 4 Oct matched every table's row count;
  still to do: run the Report Card audit against the restored copy.
- [ ] **Database rules as hooks, not promises:** block `DELETE`/`TRUNCATE`/`DROP` against
  the production database from Claude's shell, and edits to `ops/backup.sh` / `.env`.
- [ ] **Postgres upkeep:** nightly ANALYZE is done (0029). Review autovacuum settings for
  the two big tables once a year; consider partitioning `daily_prices` by year past ~20 GB.

## 4. Code and language efficiency

- [ ] **Shared numeric helpers.** `median`, `quantile`, window means and the gap rule now live
  in several files; one `src/lib/stats.ts` with tests.
- [ ] **Typed SQL results.** `db.execute<...>` casts are hand-written and `Number(...)`'d in
  every query; a small helper that parses once removes a class of silent `string` bugs.
- [ ] **Test speed and isolation:** keep the suite under 15 s; move live-NSE tests behind a
  flag so an NSE outage can't fail an unrelated merge.
- [ ] **Measure before optimising:** add `--profile` to the nightly CLI printing per-step
  time and peak memory, so this file's table updates itself.

## Done

- 2026-10-05: planner statistics refreshed nightly for every rebuilt and raw table (0029).
- 2026-10-05: per-view aggregation removed from Money flow; keys match reads (0029).
- 2026-10-04: page sizes capped, chart data rounded (0026).
- 2026-10-04: Postgres tuning, local + iCloud backups, delivery table design (0021).
