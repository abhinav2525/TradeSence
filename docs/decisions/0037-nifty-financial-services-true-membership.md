# 0037 — Nifty Financial Services on its real membership each day

**Date:** 2026-10-07 · **Status:** built on branch `finservice`. The third registered index, after
the NIFTY 50 and Nifty Bank ([0034](0034-nifty-bank-true-membership.md),
[0035](0035-nifty-bank-report-cards-and-signals.md)). Spec:
`docs/superpowers/specs/2026-10-05-bank-finservice-indices-design.md`; plan:
`docs/superpowers/plans/2026-10-06-finservice.md`.

## Problem

The owner asked for the NIFTY 50 pages for **Nifty Financial Services** too: NSE's index of 20
large finance companies (banks, but also lenders such as Bajaj Finance and Cholamandalam,
insurers, PFC and REC, and BSE). The Breadth page already offered it, but on *today's* 20
members only, which flatters the past: companies that were dropped (Indiabulls Housing
Finance, Edelweiss in 2020) would be missing from the years they belonged to.

## Options

| Option | For | Against |
|---|---|---|
| Today's 20 for every past day | Nothing to maintain | Survivorship bias (decision 0005) |
| **Rebuild the real list from NSE Indices' press releases, as for Nifty Bank** | Honest history; 10 changes in six years | A file to keep up twice a year (a test and the nightly say when) |

## Decision

- **One registry entry** in `src/ingest/indices.ts`: page key `financial-services` (the key
  Breadth already used), membership name `NIFTYFINSERVICE`, NSE's price name `Nifty Financial
  Services`, label "Nifty Financial Services", file `niftyfinservice-history.csv`, **20 members on
  every day**. Order: NIFTY 50, Nifty Bank, Nifty Financial Services, so a stock in several
  keeps opening on its earlier card (HDFC Bank on its NIFTY 50 card, as before).
- Each registry entry now also names **its own glossary entry** (`term`), so the Breadth page's
  "Members counted" tile explains the index you picked. New entry: *Nifty Financial Services*.
- **Every page that runs on Nifty Bank's real list runs on this one**: Breadth (`/?u=financial-services`,
  "Nifty Financial Services (since 2020)" in the list), Advance/Decline, Crossings, the Screener,
  Unusual activity (`set=financial-services`), Signals (washout rows only, with the "never tested
  on this index" line) and Report Cards (peers = its members on the date; **the NIFTY 50 stays the
  market line**). Wording is "x of 20", no percentile or "rare" wording.
- **Places that still assumed two indices were made generic**: Unusual activity's tabs and its
  `set` check come from the registry; the stock picker lists each stock once, under the first
  index it is in ("In Nifty Financial Services, not the NIFTY 50 or Nifty Bank", 8 stocks today);
  small-index sentences say "member" instead of "bank"; names ending in *s* take a plain
  apostrophe ("Nifty Financial Services' 20 members"). Nothing else needed changing: the nightly,
  the audit, the drift check and `computeIndicators` already loop over the registry.
- Reload is the standing guarded command: `bun run ingest:members financial-services`.

### Nifty Financial Services' changes since 2020 (what the file holds)

| Effective | Out | In | Press release |
|---|---|---|---|
| 1 Jan 2020 (start) | | AXISBANK, BAJAJFINSV, BAJAJHLDNG, BAJFINANCE, CHOLAFIN, EDELWEISS, HDFC, HDFCBANK, HDFCLIFE, IBULHSGFIN, ICICIBANK, ICICIGI, ICICIPRULI, KOTAKBANK, M&MFIN, PFC, RECLTD, SBILIFE, SBIN, SRTRANSFIN | reconstructed backwards from today's list through the changes below |
| 26 Jun 2020 | EDELWEISS, IBULHSGFIN | HDFCAMC, PEL | ind_prs10062020 (the March review, announced for 27 Mar in ind_prs18022020, deferred by COVID) |
| 31 Mar 2021 | BAJAJHLDNG | MUTHOOTFIN | ind_prs23022021 |
| 31 Mar 2022 | M&MFIN | SBICARD | ind_prs24022022_1 |
| 8 Aug 2022 | PEL | IEX | ind_prs11072022 (Piramal's scheme of arrangement) |
| 13 Jul 2023 | HDFC | LICHSGFIN | ind_prs04072023 (HDFC merged into HDFC Bank) |
| 28 Mar 2024 | IEX | IDFC | ind_prs28022024 |
| 10 Oct 2024 | IDFC | MCX | ind_prs04102024 (IDFC merged into IDFC First Bank) |
| 28 Mar 2025 | MCX | JIOFIN | ind_prs21022025 |
| 30 Sep 2025 | HDFCAMC | BSE | ind_prs22082025 |
| 30 Mar 2026 | ICICIPRULI | MFSL | ind_prs23022026 |

Sources: `https://www.niftyindices.com/Press_Release/<name>.pdf`. Two tickers changed since:
Shriram Transport Finance is `SHRIRAMFIN` (renamed 20 Dec 2022) and Indiabulls Housing Finance
is `SAMMAANCAP` (renamed 26 Jul 2024); the file stores today's symbol with the old one in
`listed_as`.

**The COVID deferment.** NSE's February 2020 review said the March changes took effect on
27 March 2020. A later release (ind_prs10062020) moved them to **26 June 2020**, so Edelweiss and
Indiabulls Housing Finance count until 25 June, not 26 March. (The same sweep found Yes Bank's
earlier exit date, decision 0036.)

## Why

The same method that made the NIFTY 50's and Nifty Bank's history honest. The registry made it
one entry: every page, the nightly, the audit and the drift check picked it up on their own.

## Problems met while building it

- **Indiabulls Housing Finance had no prices at all.** The committed file stored it as
  `IBULHSGFIN`, but a member's history is loaded backwards from *today's* symbol (decision 0003),
  and the company is `SAMMAANCAP` today. Its 120 sessions in the index (January–June 2020) would
  have counted only 19 stocks. Found by checking, for every membership period of all three
  indices, that each session has a price row; fixed in the file (`SAMMAANCAP`, `listed_as`
  `IBULHSGFIN`), with a test. That check now finds no gaps anywhere.
- **"Nifty Financial Services's".** Every sentence that built a possessive by adding *'s* to the
  label now goes through one function (`possessive`); the Signals table's footer was found on
  the screenshots and fixed with a test.

## Checks (6–7 Oct 2026)

- Counts: 20 members on every day since 2020 (the loader and the test check every boundary);
  today's 20 equal NSE's live list (live test). 31 rows loaded.
- `bun run indicators`: **222,549 rows for 93 stocks** (was 180,427 for 75) in about 7 s. Rows
  for HDFCBANK, RELIANCE and FEDERALBNK (2,484 each) are byte-identical before and after.
- **Audit** (`bun run audit:report-card`): **84 cards** (NIFTY 50 50, Nifty Bank 14, Nifty
  Financial Services 20), 2,842 numbers, **0 mismatches**, 7.6 s (before: 64 cards, 2,168
  numbers, 5.9 s).
- **Breadth by hand (SQL) agrees with the page**, above the 200-day SMA: 11 of 20 on 5 Aug 2022,
  **14 of 20 (70%) on 8 Aug 2022** (PEL out, IEX in); 18 of 20 on 9 Oct 2024, **19 of 20 (95%) on
  10 Oct 2024** (IDFC out, MCX in); 1 of 20 (5%) on 6 Oct 2026.
- **Report Card by hand**: CHOLAFIN's 6-month return is +18.78%, 2nd of the 20 members, so it beat
  18 of the other 19; the card says "18 of 19". SBICARD −10.78%, beat MUTHOOTFIN and PFC: "2 of 19".
  HDFC Bank among these 20: "7 of 19"; its default card (NIFTY 50 peers) is unchanged ("33rd",
  16 of 49, as in decision 0035).
- **Signals for Nifty Financial Services**: 6 washouts since 2020 — 9 Mar 2020 (0 of 20; index
  −24.1% after 1 month, −12.4% after 6), 22 Sep 2020 (2 of 20; +49.8% after 6), 24 Feb 2022
  (1 of 20), 29 Apr 2022 (0 of 20), 30 Mar 2026 (3 of 20, one session) and 24 Sep 2026 (live,
  1 of 20 today). The 30 Mar 2026 one falls on a rebalance day, but the swap didn't cause it:
  ICICI Prudential (out) and Max Financial (in) were both below their average. The quant
  advisor's estimate with today's 20 found 5.
- Tests: the file's spot checks on both sides of each change; the registry with three entries;
  Unusual activity's `set` accepts exactly the registered keys; a stock in Nifty Bank and
  Financial Services opens on Bank; an FS-only stock reads "x of N" with the NIFTY 50 as its
  market; the picker lists each stock once; the audit's card list and summary line with three.
- Screenshots wide and phone of Breadth, Advance/Decline, Crossings, the Screener, Unusual
  activity, Signals, CHOLAFIN's card, the picker and the Learn page; no page scrolls sideways.

## Limits

- 20 members: one company moves the share by 5 points; read the count.
- Equal weight vs index weight: HDFC Bank and ICICI Bank drive the index's close, breadth gives
  every company one vote.
- Six washouts, and the two in 2022 are one long sell-off; several overlap with Nifty Bank's and
  the NIFTY 50's. Read each row, not a pattern.
- On a phone, Unusual activity's four tabs wrap their labels onto two lines. Readable; left as is.
- Nifty 500, Midcap 150 and Smallcap 250 still use today's lists: too many changes to rebuild by
  hand from press releases.

## Revisit when

- NSE rebalances the index (end of March / end of September): add rows, then
  `bun run ingest:members financial-services && bun run indicators`.
- A fourth index is registered: it needs its file, its live test and its glossary entry; the
  rest follows from the registry.
