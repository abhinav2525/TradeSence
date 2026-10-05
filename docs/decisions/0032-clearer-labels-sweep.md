# 0032 — Numbers that could be misread: a sweep of every page

**Date:** 2026-10-05 · **Status:** done

## Problem

The crash table once showed "−49.5%" beside one date and the owner read it as a one-day fall;
it was a slide from a peak to a low weeks later (decision 0023 added the date span). The owner
asked whether the same kind of misreading could happen elsewhere. The plain-language editor
agent swept every page with that lens and found the pattern in several places: a column
called "Price" that showed a % move over three different periods; "Below for 12 sessions"
that read as "it is below now" when it meant "it had been below for 12 sessions before
crossing up"; "Back in 6 months" that read as "recovered to its old high" when it meant
"above the price on the day the crash began"; badges and phrases that read as advice or
prediction ("Rare high", "Improving", "Could cross up next", "Watching", "worth distrusting").

## Decision

Rename and reword, nothing else. Every number now says what it is and over what period, next
to the number, not in a footnote. The changes, by page:

- **Unusual activity, Top volume, Money flow:** "Price" → "Price move that day" / "Price move,
  1 week"; "Traded" → "₹ traded that day"; "Extra ₹" → "Extra ₹ traded"; "who drove it" →
  "most extra trading" (turnover counts buyers and sellers); the bar legend says "bar length:
  trading, colour: price move".
- **Screener:** "Below for" → "Was below for"; "5 sessions ago" → "Gap 5 sessions ago";
  "Could cross up next" → "Just below the average / within 2% under it"; the description no
  longer says volume shows "conviction"; "Past crossings" → "Crossings since 2020".
- **Crash table and Report Card:** "Back in 6 months" → "Above start-of-crash price 6 months on".
- **Breadth:** badges "Rare low / Rare high / Ordinary" → "Lowest 10% of days / Highest 10% of
  days / Middle of the range"; "Improving since 24 Sep" → "From 32% on 24 Sep, 5 sessions
  earlier"; "Average since 2020" → "Typical day since 2020", with "49 percentage points below
  the average day"; the rarity line says what was rare ("the share above the average was this
  low or lower on only 3% of days"); the footer names the chosen average instead of
  "long-term".
- **Crossings:** "Avg run / In run / 40d" → "Avg time on one side / Time on this side /
  40 sessions"; the description explains whipsaw without calling signals "worth distrusting".
- **Advance/Decline:** a divergence is "where the two disagree; our study of that has not
  finished, so it is not a signal".
- **Signals:** status "Active / Watching / Quiet" → "Under 20% now / Close to 20% / Well above
  20%"; "Fired 6 times" → "6 washouts"; table headers say what the columns measure; "the one
  average our study found reliable" → "the only average our study found a pattern for, from a
  handful of cases".
- **Glossary:** "most stocks falling" → "most stocks closed below their average"; "a rare low" →
  "among the lowest 10% of days"; "more big days are likely" → "the next days have tended to be big too".

## Not done (bigger than wording; owner's call)

The Report Card's big tile figures (e.g. "+8.2%", "85%", "78th") still rely on the sentence
under them to say what they are; the editor suggested starting each sentence with the figure's
meaning. Also a "/100" unit on the percentile tile.

## Checks

613 tests pass (two Signals wording tests updated to the new words); screenshots of Breadth
(desktop and phone), Screener, Signals and a stock page show no overflow.

## Revisit when

A new page adds a number: it must carry its period and its "of what" beside it.
