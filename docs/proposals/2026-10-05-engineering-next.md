# Engineering: what next (lead engineer, 5 Oct 2026)

The owner asked: "What's next on engineering, and how would you do it?" This takes
`TODO-engineering.md`, re-checks its numbers against the database and code (read-only), and
picks the next two items by value ÷ effort. It is a proposal, not a decision.

## Short answer

1. **A nightly report that reaches your phone, every night, with how long each step took.**
   Today, if the nightly job fails or never runs, nobody finds out. Half a day.
2. **The website starts itself after a reboot, and one command puts a merge live.** Today
   both are done by hand. About two hours.

Speed work (one pass over histories, more CPU cores, DuckDB, Rust) is **not** next: the
database is healthy and the nightly job runs while nobody is waiting for it.

## What I checked (5 Oct 2026, read-only)

| Roadmap says | Measured today | Comment |
|---|---|---|
| Database 1.6 GB, prices 884 MB, delivery 590 MB | **1.6 GB, 884 MB, 590 MB** | Correct |
| +~250 MB a year | Last 12 months added 641k price rows + 598k delivery rows (≈ 210 MB at today's row size) | Correct in size |
| Page reads < 1 ms by primary key | Postgres health check: no invalid, duplicate, bloated or unused indexes; cache hit rate 99.9% (indexes) / 100% (tables); 14 connections; no vacuum danger | Healthy. Nothing to tune |
| Nightly run ~2 min | **Can't be confirmed.** The log has no times at all, no start or end time and no per-step durations | Probably higher now: breadth alone is listed as 1–2 min in `docs/pipelines.md` |
| "Money flow, breadth and Top volume each load all ~2,400 histories (3 × ~15 s)" | **Four** whole-market passes: Unusual activity (~2,950 companies), breadth (~3,000), Top volume (755), Money flow (755): about **7,500 history loads a night**. One full 10-year history (RELIANCE) takes 15–20 ms in Postgres | The roadmap undercounts, but it's still only 1–2 minutes of work at 19:30 with nobody waiting |
| Backup restore drill: not done | `docs/pipelines.md` §11: a restore into a scratch database matched every table's row count on 4 Oct | Half done. What's left is running the Report Card audit against the restored copy |
| "Keys match reads": audit `daily_indicators`, `unusual_days` | Both already have the date-first key **and** a `(symbol, trade_date)` index | Effectively done at the index level |
| Failed price days | 0 `error` rows in `ingest_log` | The resilience design is working |

Two problems I found in the code, both relevant to item 1:

- **Some nightly steps aren't protected.** `src/ingest/cli-nightly.ts` wraps the later steps
  in warn-and-carry-on, but not `computeIndicators` (line 91) or the two plain SQL queries
  (lines 83 and 111). If any of those throws (Postgres restarting, say), the whole job stops
  there and **skips Unusual activity, Top volume, Money flow, breadth, the audit and the
  backup**. The only sign is a stack trace in a log file nobody reads.
- **Some docs are out of date.** The nightly order in `docs/pipelines.md` stops at step 11.
  Money flow (15), breadth (16) and the statistics refresh aren't in it. The `cli-nightly.ts`
  row in `src/ingest/CLAUDE.md` misses the same steps. The technical lead should fix this
  in the same change as item 1.

---

## 1. Nightly report to your phone, with timings

**The problem in one sentence.** Every safety check in the system ends as a `WARNING` line in
`~/Library/Logs/tradesence-nightly.log`, so a failed or missed night goes unnoticed until
you happen to spot stale numbers on a page.

**Measured today.** 0 notifications. 0 timings in the log. 1 unguarded step that can skip
the backup (above). The roadmap already calls this "highest-value ops item".

**Trigger.** It has already happened: there are seven checks that write warnings and none of
them reaches a person.

**Design.**

- **One message every weekday night, good or bad.** Example:
  `tradeSence 1 Oct ✅ 14 steps, 3m 40s · prices +2,981 · 0 warnings · backup 208 MB`, or
  `⚠️ 2 warnings: delivery not loaded for 1 day; NIFTY 50 changed (added X)`. Sending it
  on good nights too matters: **if no message arrives, that silence is the alarm** (Mac
  asleep, launchd broken, Postgres down). An alert that only fires on failure can't tell
  you the job never started.
- **Each step is timed and protected the same way.** A small `step("money flow", fn)` helper
  in `cli-nightly.ts` notes the start time, runs the step, catches any error as a warning,
  and records how long it took. Every step goes through it, including `computeIndicators`
  and the two bare queries, so nothing can skip the backup again. The log gains a
  `[nightly] timings: …` line, and the "Where we stand" table in `TODO-engineering.md` can
  then be filled from real numbers. This is the roadmap's `--profile` item; it costs almost
  nothing once the helper exists.
- **Warnings are collected, not just printed.** A `warn()` function writes the same line to
  the log and adds it to a list. The digest is built from that list, plus the audit and
  backup results the job already reads.
- **The message goes out last, from a `finally` block**, so it is sent even when something
  crashed mid-run. If sending fails, that is one log line; the job still exits normally.
- **Where it goes: I recommend Telegram** (still your choice). Sending is one web request
  with a bot token and your chat ID kept in `.env`. The phone gets a push notification and
  there's no email password to store. Setup on your side takes about 10 minutes: create a bot
  with @BotFather and send it one message. *Alternative:* email through Gmail. It needs an
  "app password" in `.env` and a mail library, and a nightly email is easier to ignore than
  a push.
- *Optional second line of defence, later:* a free "heartbeat" service (such as
  healthchecks.io) that the job pings at the end. If the ping doesn't arrive by 21:00, the
  service emails you. This also catches the case where the Mac itself is off.

**What the message contains:** counts, step names, warnings and durations. No prices and no
secrets.

**Tests that prove it** (written first, as usual):
- `formatDigest`: a good night, a night with warnings, a night where a step threw. Plain
  inputs in, exact text out.
- `step()`: a step that throws becomes a warning, and the *next* step still runs.
  Specifically, a throwing `computeIndicators` doesn't stop the backup.
- `notify`: takes an injected `fetch` (the project's rule: injected parameters, not mocks).
  A failed send is a log line, not a crash. With no token configured it does nothing quietly,
  so tests and other machines never send messages.
- Then by hand: `launchctl kickstart gui/$(id -u)/com.tradesence.nightly` and the message
  arrives on the phone.

**Effort.** Half a day, tests included. **Risk.** Low. It only adds output; no data or
schema
changes. The only real risk is a noisy message you learn to ignore. Keep it to one line on
good nights.

Update `docs/pipelines.md` (row 6 becomes "✅ automated") and write a decision record.

---

## 2. Website restarts itself; one-command deploy

**The problem in one sentence.** The site on `:3000` is a process started by hand: it dies
when the Mac reboots, and every merge needs a manual stop/rebuild/start before it shows up.

**Measured today.** 2 manual jobs: restart after every reboot, and the kill/build/start
sequence after every merge. CLAUDE.md lists two gotchas caused by this: a build replaces
`.next` under the running server, and the build flips `next-env.d.ts`.

**Trigger.** Every reboot and every merge. Merges happen several times a day right now.

**Design.**

- A second launchd agent, `com.tradesence.web`, copying `ops/install-nightly.sh`. It runs
  `bun run start` with **bun's absolute path**, because launchd's PATH has no `bun` (an
  existing gotcha). `RunAtLoad` + `KeepAlive` mean it starts at login and comes back if it
  crashes. Logs go to the existing `~/Library/Logs/tradesence-web.log`.
- `bun run deploy:local`: build, then `launchctl kickstart -k` to restart the agent, then
  `git checkout next-env.d.ts`. The site is unavailable for a few seconds during the
  restart, which is fine for a site with one user.
- The install script must first stop the detached `bun run start` that's running now, or the
  two will fight over port 3000.

**Tests.** Mostly by hand, written down in the decision record: reboot (or log out and in)
and the site answers; `deploy:local` and the change is visible; kill the process and it
comes back within seconds. Script logic is shell, like `ops/backup.sh`.

**Effort.** About two hours. **Risk.** Low. Worst case the agent fails to start and you
start the site by hand, as today.

---

## What I would not do yet

- **One pass over the stock histories.** It saves maybe a minute of a job that runs at 19:30
  while nobody waits. It's also less simple than the roadmap suggests: two of the four
  passes read EQ+BE and two read EQ only, so sharing a history means changing
  `loadAdjustedHistory`, the one loader everything depends on. And today the four steps
  fail independently; merging them means one bad stock could take down four pages instead
  of one. Wait for item 1's timings to show the nightly job past ~10 minutes.
- **Using every CPU core, DuckDB, Rust.** No measured need. The biggest study runs in 75 s,
  well under its 10-minute trigger, and page reads are cache hits.
- **Partitioning `daily_prices`.** 884 MB against a ~20 GB trigger. At ~210–250 MB a year
  that's decades away.
- **Derived-table framework.** Five tables now share one shape, so the case is real. But
  refactoring five working pipelines carries risk and earns nothing today. Do it as part of
  the next new derived table, with that table as the first user.
- **Autovacuum review.** `corporate_actions` has 4,521 dead rows (about 20%) but it's 9 MB,
  and every health check passed. Leave it until the yearly review.

## Small follow-ups (minutes each, bundle with item 1)

- Fix the nightly order in `docs/pipelines.md` and the `cli-nightly.ts` row in
  `src/ingest/CLAUDE.md` (missing Money flow, breadth, statistics).
- Correct `TODO-engineering.md`: four whole-market passes (~7,500 history loads), not three.
  Restore drill half done. Keys-match-reads audit done for `daily_indicators` /
  `unusual_days`. Nightly time "to be measured" until item 1's timings exist.

## The one thing I would do first

**Item 1, and within it the `step()` helper first.** One small change does three jobs: it
closes the hole where one failing step silently skips the backup, it gives every number in
the roadmap a real measurement, and it's what the phone message is built from. Every later
engineering decision, including whether speed work is ever needed, depends on knowing what
happens each night, and today we don't.
