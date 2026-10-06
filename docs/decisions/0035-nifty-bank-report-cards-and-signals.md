# 0035 — Report Cards for every Nifty Bank member, and Signals for Nifty Bank (step B)

**Date:** 2026-10-06 · **Status:** built on branch `bank-nifty-step-b`. Step A is decision
[0034](0034-nifty-bank-true-membership.md). Spec:
`docs/superpowers/specs/2026-10-05-bank-finservice-indices-design.md`; plan:
`docs/superpowers/plans/2026-10-06-bank-step-b.md`; advisor reviews:
`docs/proposals/2026-10-05-review-bank-finservice-spec-*.md`.

## Problem

After step A, the Nifty Bank views showed nine banks (Federal Bank, PNB, Canara Bank…) with no
Report Card, because cards existed only for NIFTY 50 stocks. And the Signals page (the
"washout" alarm: fewer than 20% of stocks above their 200-day average) only knew the NIFTY 50.

Two traps:

1. **Measuring a bank against Nifty Bank partly measures it against itself.** HDFC Bank is a
   quarter to a third of the Nifty Bank index. If the card's "market" were Nifty Bank, HDFC
   Bank's beta, "Bad days" and "In crashes" would partly compare HDFC Bank with HDFC Bank, and
   every bank would look like it "moves with the market".
2. **The 20% washout line was only ever tested on the NIFTY 50** (research 0001). On 12–14 banks
   "under 20%" means "2 or fewer above", one bank moves the reading by about 7 points, and the
   episodes are mostly the same sell-offs the NIFTY 50 already had. A median of five or six
   overlapping episodes would look like evidence it isn't.

## Options

| Option | For | Against |
|---|---|---|
| Nifty Bank as the Report Card's market for banks | One index everywhere on the card | Trap 1: a bank partly compared with itself |
| **NIFTY 50 as the market for every card; the stock's index only for the peer rank** (owner, 2026-10-05) | Every light keeps its meaning: "risk against the whole market" | A bank's Strength and its other checks use different yardsticks, so the card must say so |
| Signals for Nifty Bank with the full page (medians, "higher in x of y", buckets) | Same page for both | Trap 2: summaries of a handful of overlapping, untested episodes |
| **Signals for Nifty Bank as episode rows only, with an "untested" line** (quant advisor) | Every fact visible, nothing summarised | Less to read |

## Decision

**Report Cards**
- Every member, past and present, of every registered index has a card (`supportedStocks`).
  A bank that was never in the NIFTY 50 (Federal Bank) opens at `/stock/FEDERALBNK`.
- **The market line is always the NIFTY 50**: bumpiness, worst fall, the risk calculator's
  comparison, beta and down capture ("Bad days"), and the crashes ("In crashes" uses NIFTY 50
  breadth to find crashes and the NIFTY 50's fall in each).
- **The stock's index chooses only the peers** for Strength. **The default card** (no `u` in
  the link) ranks the stock within the first registered index it belongs to **on the date
  shown**; only if it is in none of them that day does it fall back to the first index it was
  ever in. So a stock in both indices (HDFC Bank, ICICI Bank, Axis Bank, Kotak, SBI) is ranked
  against the NIFTY 50 by default, exactly as before, URL and numbers unchanged; a stock that
  left the NIFTY 50 and is in Nifty Bank today (IndusInd Bank, YES BANK) opens on its Nifty
  Bank card, and on a 2024 date (IndusInd still in the NIFTY 50) on its NIFTY 50 card. The
  switch on the card (`?u=bank`, `?u=nifty50`) picks the other index; the link keeps `u` only
  when it differs from that date's default. A `u` for an index the stock was never in is ignored.
- Whenever the peers aren't the NIFTY 50's, the header says: "Strength ranks it among Nifty
  Bank's members on that day. Every other check compares it with the NIFTY 50, the market."
- **"x of N", not a percentile**, for Nifty Bank peers: "stronger than 11 of the 13 other Nifty
  Bank members", figure "11 of 13". The light keeps its rule (top third green, bottom third red).
  The NIFTY 50 wording (HDFC Bank today: "stronger than 33% of the other 49 members", "33rd") is unchanged.
- The stock picker (`/stock`) gains a group "In Nifty Bank, not the NIFTY 50".
- "Has a card" on Unusual activity, Top volume and Money flow now means "ever in a registered
  index", so those banks link to their cards. Links from a Nifty Bank view open the card's
  default (for HDFC Bank, NIFTY 50 peers); the switch is on the card (the owner's rule that
  moving between pages doesn't keep the index).

**Signals**
- `/signals?u=bank` runs the **same rules** (under 20% of members above the 200-day average,
  episodes merged within 10 sessions, the 20–25% "watching" band) on Nifty Bank's real members
  each day, with returns measured on **Nifty Bank's own close**. Nothing was retuned.
- It shows the alarm card ("4 of Nifty Bank's 14 members are above their 200-day SMA (29%)")
  and **one row per washout** with what the index did 1, 3 and 6 months later, and the lowest
  count in each ("1 of 12"). **No medians, no "higher in x of y", no breadth buckets, no
  over-80% side.** The banner leads with: "Same 20% line as the NIFTY 50 alarm; never tested
  on this index; several episodes are the same sell-off." and says the index's close is driven
  by its two or three biggest banks while breadth counts every bank once.
- The washout notice on the Breadth page stays NIFTY 50 only.

## Why

The owner's market-line decision keeps every Report Card light meaning what its glossary entry
says: how the stock behaves against the whole market. Only "who it is compared with" (its
peers) is a question the index should answer, and a bank-only stock has no NIFTY 50 peers to
be ranked against. For Signals, showing each episode is honest about how few there are; a
summary would turn three sell-offs into what looks like a track record.

## Checks (6 Oct 2026)

- **Audit** (`bun run audit:report-card`, independent recalculation from raw prices): now 64
  cards (50 NIFTY 50 + 14 Nifty Bank, each with its own peers), 2,168 numbers, **0 mismatches**,
  5.9 s. Each stock's **default card is fetched the way the page serves it** (no `u`), so a
  wrong default rule fails the audit: putting back the old "first index ever" rule gives 10
  mismatches, all on IndusInd Bank and YES BANK. The audit checks **one session** (the latest,
  unless given a date); the rules on past dates rest on the unit tests. Before: 50 cards, 1,592 numbers, 0 mismatches, 5.0 s. It now also checks the peer count
  and how many peers the stock beat. Forcing the wrong peers on purpose gives 28 mismatches, so
  the audit can fail.
- **By hand (SQL)**: Federal Bank's 6-month return 20.50%, 3rd of the 14 banks, so it beat 11
  of the other 13; the card says "11 of 13". HDFC Bank among banks beats SBI, Bank of Baroda
  and Canara Bank: "3 of 13" (among NIFTY 50 members: 16 of 49). Federal Bank's beta by SQL is
  0.854 against the NIFTY 50 and 0.822 against Nifty Bank; the card shows 0.854.
- **Signals for Nifty Bank** on the real membership: 7 washouts since 2020 — 1 Feb 2020,
  28 Feb 2020 (index −27.8% after 3 months, −18.1% after 6), 17 Dec 2021, 3 Mar 2022,
  9 Jun 2022 (+15.2% / +24.6%), 13 Jan 2025 (+10.6% / +19.0%), 21 Feb 2025 (+13.8% / +9.5%).
  The quant advisor's estimate used today's 14 banks and found 6; the 2025 episodes agree to
  the rounding. May 2022 was a washout only on today's list (2 of 14); the real 12 banks had
  3 of 12 (25%), checked in SQL. 2020 starts earlier and December 2021 appears because the real
  list held YES BANK, RBL Bank and Bandhan Bank. That is the survivorship effect decision 0034
  exists to avoid. The NIFTY 50 view is unchanged (6 washouts, one live since 1 Oct 2026).
- Tests: a bank-only card ranks among the banks on the date (a bank that left counts only
  before it left); its beta is 1 against a NIFTY 50 that moves like it and its crashes come
  from NIFTY 50 breadth; a stock in both switches peers with `u` and nothing else changes; a
  foreign or junk `u` falls back; Signals for Nifty Bank uses only its members and its own close.
- Screenshots wide and phone, dark and light. A phone-width overflow on `/signals`, already on
  `main`, was fixed in passing.

## Problems met while building it

- **The nightly reads the audit's last line.** Adding the run time to the end of the summary
  ("… 0 mismatches · 5.9 s") would have made the nightly report "Report Card audit did not
  finish" every night, because it looks for a line ending in "N mismatches". The summary line
  now comes from one shared function (`auditSummary`) with a test that the nightly parses it;
  the time is printed on its own line.

## Found by the independent review (fixed)

- **The default card follows the date shown.** The first build opened every stock on the first
  index it was *ever* in, so IndusInd Bank and YES BANK (out of the NIFTY 50, in Nifty Bank
  today) opened ranked among NIFTY 50 members they no longer belong to. Now the default is the
  index the stock is in on the date shown (see Decision). The card's NIFTY 50 tab for such a
  stock carries `u=nifty50`, since without it the link would open the Bank card again.
- The audit covers the served default card (see Checks).
- Tests that would have missed a real break were tightened: exact Strength values (including
  "1 of the 2 other Nifty Bank members"), a bank that joined later not counted before it
  joined, what the Signals table and card actually print for Nifty Bank vs the NIFTY 50, the
  audit's summary line word for word, and which cards the audit checks. The Signals page's
  "which cards does this index get" rule and the "one member moves the share by N points"
  note moved into tested functions; components take a `tested` flag instead of comparing the
  label "NIFTY 50".
- Glossary: "13 other banks" and "about 7 points" now say they are today's (14 banks since
  31 Dec 2025; 12 before, when one bank was about 8 points).

**Left for later (small, recorded on purpose):**
- On a date when the stock was not in the index whose peers it is ranked against (IndusInd
  Bank today with `?u=nifty50`), Strength still says "the other N members", though it isn't one.
- The Strength light keeps top/bottom thirds on 11–13 peers: one place decides the colour.
- "1 pts above the 20% line" should read "1 pt".
- Stepping the date across a membership change can move the default card to the other index.

## Limits

- A rank among 13 banks says nothing about the rest of the market: a bank can beat most banks
  and still lag the NIFTY 50. The sentence always gives the NIFTY 50's 6-month return beside it.
- Seven Nifty Bank washouts are about three sell-offs (2020, 2022, 2025). Read each row, not a
  pattern.
- Nifty Financial Services is not registered yet.

## Revisit when

- Nifty Financial Services is added: one registry entry; its cards and Signals view come free,
  and the audit covers them automatically.
- Someone wants a bank's risk measured against Nifty Bank too: label it as a separate figure;
  never replace the NIFTY 50 market line.
