# 0034 — Nifty Bank on its real membership each day (step A)

**Date:** 2026-10-05 · **Status:** step A built (Breadth, Advance/Decline, Crossings, Screener,
Unusual activity). Step B (Report Card for every member, Signals) and Nifty Financial Services
are still to come. Spec: `docs/superpowers/specs/2026-10-05-bank-finservice-indices-design.md`;
advisor reviews: `docs/proposals/2026-10-05-review-bank-finservice-spec-*.md`.

## Problem

The owner asked for the NIFTY 50 pages for **Nifty Bank** too. Two traps:

1. **Today's list flatters the past.** Breadth already offered "Nifty Bank" (decision 0030),
   but counted on *today's* 14 banks, so its history starts in October 2026. Drawing it
   backwards with today's banks would leave out the ones that collapsed and were removed
   (YES BANK in March 2020): the past would look healthier than it was. The quant advisor
   measured this for the NIFTY 50: today's members find 4 washouts since 2020, the real
   day-by-day list finds 6.
2. **Three spellings of one index.** Nifty Bank is `"Nifty Bank"` in NSE's daily index-close
   file, `bank` in our list of NSE member files, and needed a membership name. Three strings
   typed in different places is how a file gets loaded under the wrong name.

## Options

| Option | For | Against |
|---|---|---|
| Today's list for every past day | Nothing to maintain | Survivorship bias; contradicts decision 0005 |
| **Rebuild the real membership by hand from NSE Indices' press releases** (as for the NIFTY 50) | Honest history; few changes (5 since 2020) | A file to keep up twice a year (a test and a nightly warning say when) |
| A parameter per page with its own name (`index=bank`) | — | Two URLs for two different Nifty Bank charts (`/?u=bank` already existed) |
| **One parameter `u`, with the keys Breadth already uses** | Every existing link unchanged; one check | — |

## Decision

- **One registry** (`src/ingest/indices.ts`): each index is one entry binding its page key
  (`bank`), its membership name (`NIFTYBANK`), NSE's price name (`Nifty Bank`), its member-list
  key (`bank`), its label, its file (`niftybank-history.csv`) and its expected size by date.
  Nothing else spells these names. Adding Nifty Financial Services later is one entry, its
  CSV and its live test.
- **The membership file** `src/ingest/niftybank-history.csv`, one row per period, each citing
  its press release. The loader refuses a file that has a gap, an overlap or the wrong number
  of banks on any day: **12 until 30 Dec 2025, 14 from 31 Dec 2025** (the size is a reviewed
  code change in the registry, not a CSV comment).
- **Reloading a file is a standing rule, with guards** (owner, 2026-10-05):
  `bun run ingest:members bank` replaces *only that index's* rows in `index_members`, in one
  transaction; a file with fewer rows than are stored is refused unless `--force` (history
  only grows, so a shorter file is more likely a slip); it is manual only, never nightly.
  `bun run ingest:nifty50` still works and goes through the same loader.
- **Averages once for every index's members**: `computeIndicators` now covers the members,
  past and present, of every registered index, each stock once (HDFC Bank is in both and is
  computed once). The nightly step is now inside its own error catch, so a failure no longer
  skips the later steps and the backup.
- **Nightly checks, no reloads**: after the index lists are downloaded, each file is compared
  with NSE's list (`WARNING Nifty Bank changed: NSE added …`) and with the database
  (`… differs from the database: run bun run ingest:members bank`). If NSE's list wasn't
  refreshed that night, it says "could not check" instead of comparing a stale list.
- **Pages**: `u=bank` on Breadth (now drawn from the real membership, `/?u=private-bank` and
  the other lists stay on today's list), Advance/Decline, Crossings and the Screener (an
  `NIFTY 50 | Nifty Bank` switch beside the average tabs); Unusual activity gains a
  `Nifty Bank` tab (`set=bank`, a bank counts only on days it was in the index). Arrows,
  1–3 and every link on a page keep `u`; the keys that jump to another page (`a`, `c`, `s`…)
  open the NIFTY 50 view (owner's choice).
- **Wording for a 12–14 stock index** (quant advisor): "4 of Nifty Bank's 14 members", a
  "Members counted x of N" tile, **no percentile or "rare" wording**, and a line that one bank
  moves the share by about 7 points. The McClellan footer says to read its side of zero, not
  its size; the thrust thresholds (set for 50 stocks) are not shown for banks.
- **Report Card links**: Report Cards still exist for NIFTY 50 stocks only (step B adds the
  banks), so on Nifty Bank views a bank without a card (Federal Bank, PNB…) shows unlinked
  instead of linking to a missing page. The "has a card" flag on Unusual activity, Top volume
  and Money flow is unchanged.

### Nifty Bank's changes since 2020 (what the file holds)

| Effective | Out | In | Size | Press release |
|---|---|---|---|---|
| 1 Jan 2020 (start) | | AXISBANK, BANKBARODA, FEDERALBNK, HDFCBANK, ICICIBANK, IDFCFIRSTB, INDUSINDBK, KOTAKBANK, PNB, RBLBANK, SBIN, YESBANK | 12 | reconstructed backwards from today's list through the changes below |
| 27 Mar 2020 | YESBANK | BANDHANBNK | 12 | ind_prs12032020 (YES BANK left F&O) |
| 31 Mar 2021 | BANKBARODA | AUBANK | 12 | ind_prs23022021 |
| 31 Mar 2022 | RBLBANK | BANKBARODA | 12 | ind_prs24022022_1 |
| 30 Sep 2024 | BANDHANBNK | CANBK | 12 | ind_prs23082024 |
| 31 Dec 2025 | | UNIONBANK, YESBANK | 14 | ind_prs01122025 (SEBI circular of 29 May 2025: "maximum of 12" became 14) |

Sources: NSE Indices press releases, `https://www.niftyindices.com/Press_Release/<name>.pdf`.

## Why

It is the same method that made the NIFTY 50's history honest (0005), and with only five
changes it costs minutes a year. The registry is what makes the delete-and-reload safe: a
file can only ever load under its own name.

## Checks (5 Oct 2026)

- Bank counts in the database by date: 12 on 26 and 27 Mar 2020, 12 on 30 Dec 2025, 14 on
  31 Dec 2025, 14 today; today's 14 equal NSE's live list (live test).
- `bun run indicators`: 180,353 rows for 75 stocks (was 158,570 for 66) in about 6 s; the
  rows for HDFCBANK, RELIANCE and ETERNAL (6,256) are byte-identical before and after.
- Breadth for Nifty Bank recomputed by hand in SQL agrees with the page: 0 of 12 on 26 and
  27 Mar 2020, 11 of 12 on 30 Dec 2025, 13 of 14 on 31 Dec 2025, **4 of 14 (29%) on
  5 Oct 2026** (the quant review also found 4 of 14).
- Tests: a bank that left mid-window counts only before it left, on every page's query; a
  shrinking reload is refused and leaves the stored rows intact; loading Nifty Bank leaves the
  NIFTY 50's rows untouched.

## Limits

- 12–14 banks: the reading moves in steps of about 7 points and has only 13–15 possible
  values. Read the count.
- Equal weight vs index weight: breadth gives every bank one vote; the Nifty Bank index is
  driven by HDFC Bank and ICICI Bank. They can disagree for weeks.
- Crossings' "Calmest" can be a bank that only recently joined (Union Bank, 3 crossings since
  Dec 2025), the same as for a new NIFTY 50 entrant.
- No Report Cards or Signals for Nifty Bank yet (step B).

## Revisit when

- NSE rebalances Nifty Bank (end of March / end of September): add rows as in 0005's "How to
  update it", with `bun run ingest:members bank && bun run indicators`.
- Step B (Report Card, Signals) or Nifty Financial Services is built.
