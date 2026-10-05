# Quant review: Bank Nifty and Nifty Financial Services spec

**Spec:** `docs/superpowers/specs/2026-10-05-bank-finservice-indices-design.md` · **Reviewer:** quant advisor · **Date:** 2026-10-05

## 1. Worth asking?

Yes. It is a **tracking** feature (facts, no prediction), and banks and lenders are about a
third of the NIFTY 50's weight, so "are the banks healthy?" is a real question about where money
moves. Rebuilding true membership by hand (not using today's list) is the right call. My
estimate below shows why: using today's NIFTY 50 list for the past found **4** washouts since
2020; the true day-by-day list finds **6**. Today's members are the survivors, so they make the
past look healthier.

## 2. What could still be wrong with perfect code

- **Big steps.** One stock moves Nifty Bank's reading by **7.1 points** and Fin Services' by
  **5.0** (NIFTY 50: 2.0). Since 2020 the Bank reading crossed the 20% line **26 times**, Fin
  Services 17, NIFTY 50 9. "Under 20%" on 14 stocks just means "**2 or fewer** above"; 3 of 14
  is 21% and doesn't count. On 20 stocks it means 3 or fewer.
- **The 20% line was tested only on the NIFTY 50** (research 0001). On these indices it is the
  same line, untested. The page must not imply research 0001 applies to them.
- **The episodes aren't new evidence.** They are the same sell-offs the NIFTY 50 already had
  (2020, 2022, 2025). Bank's three 2022 episodes (March, May, June) are one sell-off counted
  three times.
- **The Report Card's "market" becomes partly the stock itself.** HDFC Bank is roughly a
  quarter to a third of Nifty Bank. Beta, "Bad days" and "In crashes" measured against Nifty Bank
  partly compare HDFC Bank with itself, and every bank will look like it "moves with the
  market". That changes what the lights mean, from market risk to how a bank moves against
  other banks. **Change:** keep the NIFTY 50 as the "market" for the risk lights, and use the
  chosen index only for the peer rank. If the owner wants both, label them separately.
- **The denominator changes.** New listings (SBI Card 2020, Jio Financial 2023) have no 200-day
  average for their first 200 sessions, so Fin Services counted **18 to 20** stocks. Always show
  "x of N counted".
- **McClellan on 14 stocks** swings far more than on 50. Any thresholds or "extreme" wording on
  Advance/Decline need to be checked for these indices, or the oscillator hidden for them.
- **Equal weight vs. index weight.** Breadth counts every stock once, but the index's own close
  (used for "what happened next") is driven by 2 or 3 heavyweights. They can disagree for weeks.
  Say so in one line.

## 3. Rules

No new study, so there are no pass/fail rules to fix. That is right. Do **not** retune the
20% line, the 10-session merge or the watch band for these indices. That would be tuning on
the results.

## 4. Your question: Signals on 14 and 20 stocks

My estimate uses **today's members** (survivorship, see section 1: expect slightly too few
episodes), with split- and bonus-adjusted 200-day averages computed in SQL. Washout = under 20%.
Episodes are merged within 10 sessions. Returns are the index's own close.

| Index | Episodes 2020–26 | Distinct sell-offs | Later return of the index (3 m / 6 m) |
|---|---|---|---|
| Nifty Bank (14) | 6 | 3 | Mar-20 −25/−15; Mar-22 +6/+22; May-22 +10/+22; Jun-22 +15/+25; Jan-25 +11/+19; Feb-25 +14/+10 |
| Fin Services (20) | 5 (1 live now: 1 of 20 above) | 3–4 | Mar-20 −13/−6; Feb-22 0/+10; May-22 +8/+14; Mar-26 +14/+4; Sep-26 pending |

For comparison, an ordinary 6 months since 2020 returned a median of **+6.5%** (Bank) and
**+6.8%** (Fin Services).

**Recommendation:** show the episode list with each episode's later return (facts, with the
count visible). **Hide the median and "higher in x of y" summary rows** for these two indices.
Five or six overlapping episodes from three sell-offs can't support a summary. Add one line:
"Same line as the NIFTY 50 alarm; never tested on this index; these are mostly the same
sell-offs." Keep the "rare" and percentile wording off the Breadth page for these indices (Bank
has only 15 possible readings).

## 5. What the owner can do with it

See whether the banks lead or lag the market's weakness. Right now Fin Services is at 5% (1 of
20) and the NIFTY 50 at 14%, while Nifty Bank is at 29% (4 of 14). That is a fact worth showing.
It is not a trading signal.

## Verdict: proceed with these changes

1. Report Card risk lights stay measured against the NIFTY 50; the index is used only for peers.
2. Signals for these two indices: episode rows only, no medians, plus the "untested" line.
3. Show "x of N counted" everywhere; no "rare" or percentile wording; check McClellan wording.

**First thing I'd do:** change item 1. It is the only place where the numbers would mean
something different from what the page says.
