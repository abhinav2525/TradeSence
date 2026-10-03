# 0017 — Signals page: the breadth washout alarm

**Date:** 2026-10-03 · **Status:** done

## Problem

On 1 Oct 2026 the share of NIFTY 50 stocks above their 200-day average fell to 16%.
Research [0001](../research/0001-does-breadth-predict.md) found that this reading (under
20%, a "washout") is the one breadth level with a track record: every past washout since
2020 was followed by a higher index six months later. But the app only showed "16%" as a
plain number. Nothing said this was unusual, or what had happened after the other times.

The owner wanted an alarm with its evidence next to it, written so that someone without a
finance background can read it.

## What we built

- **`/signals`** (sidebar group "Research", key `g`):
  - **The washout card:** a status badge (Active / Watching / Quiet), one sentence, a small
    chart of the last 60 sessions with the 20% line, and how many times it has fired since
    2020.
  - **"What happened next":** for 1, 3 and 6 months, the typical (median) return, how many
    episodes ended higher, the best, the worst, and the same figure for an ordinary day.
    Then a plain sentence reading the table, and a bar chart comparing every breadth level.
  - **An episodes table:** every past washout, with its returns.
- **A one-line notice on the Breadth page** while the alarm is Active.

Everything is computed fresh each time the page opens (`src/indicators/signals.ts`,
`src/query/signals.ts`; the sentences are in `src/components/signals-copy.ts`).

## Decisions

**1. Only the washout for now.** The design mockup had three alarms: washout, breadth
thrust and divergence.
- Options: (a) the washout plus the history behind it; (b) the washout card alone; (c) all
  three.
- **Chosen: (a).** Only the washout has a study behind it. The breadth thrust was designed
  for about 3,000 US stocks and may fire far too easily on 50. The divergence needs
  thresholds ("how near the high?", "how big a drop?") that must come from data, not
  guesses. Both stay **off the page entirely**, with no "coming soon" boxes, until their
  own studies say they're worth building (TODO). Option (b) would make a claim without
  showing the evidence.

**2. The 200-day simple average only, with no tabs.** Every other page lets you switch
between three averages.
- Options: (a) no tabs; (b) tabs that change only the history; (c) tabs that change the
  alarm too, as in the mockup.
- **Chosen: (a).** The 50-day version was noisy in research 0001 (about half its episodes
  were followed by falls), and the 200-day exponential behaved almost the same as the
  simple one. With (c), the page would show a "washout" alarm on an average the research
  says not to trust. With (b), the page would show different things depending on the tab.
  The page says why in one line.

**3. Dropped the mockup's "20–80%" option** from the Under/Over switch. That option is just
ordinary days, and the bar chart already shows them.

**4. Computed live, not saved nightly.** A nightly table only pays off once the nightly
digest (a later TODO item) needs to read it. Computing live means the page can never show
stale numbers. That staleness happened to the research note itself (below).

**5. One rule for "one episode".** The shared episode finder
(`src/indicators/episodes.ts`) now also returns where each episode ended and how many days
it lasted (`findEpisodeSpans`). Research 0001, the Report Card's "In crashes" light and
the Signals page all use it, so they can't disagree about how many washouts there were.
The Report Card goes one step further and merges crashes whose 3-month windows overlap.
That's why it counts fewer "crashes" than Signals counts washouts. Both are right for
their question.

**6. Exactly 20% is "Watching", not "Active".** Research defines a washout as *under*
20%. Watching covers 20–25%: close to the line, or just recovered.

**7. The home notice shows only while Active, and only on the latest session.** Someone
looking at March 2025 on the Breadth page isn't told about today.

**8. The typical return is the median, not the average.** With five episodes, one big
number (like the COVID rebound) pulls an average a long way. The median is the middle
episode. The research note reports averages, so its numbers differ slightly from the
page's. Both are labelled.

**9. A return that runs past today, or across a gap in the data, is left out** of the
summary. The episodes table shows "Not yet" for the first and "—" for the second.

## Something we found along the way

Re-running research 0001 on 3 Oct gave different numbers from the note written on 2 Oct.
The study counted 1,678 sessions instead of 1,670, and the early-2025 episode moved from
28 Feb to **24 Feb 2025**, with its 6-month return dropping from +11.8% to +9.2%.

**Cause:** decision [0007](0007-weekend-trading-sessions.md) loaded 8 weekend trading
sessions 36 minutes after the study was committed. One of them is the Budget Saturday,
1 Feb 2025. One more session nudged the 200-day averages enough that 24 Feb 2025 now reads
18% (9 of 50) instead of 20%. That moves the start of the episode, and with it the day
"126 sessions later" lands on.

**Fix:** research 0001 was refreshed with a dated note. The conclusion is unchanged (5 of
5 higher six months later). The page computes its numbers live, so it can't go stale like
this.

## What would make us revisit

- A completed study of the breadth thrust or the divergence that holds up: add its card.
- A washout followed by a *lower* index six months on: the page's sentence already adapts
  ("4 of 6 washouts were higher…"), but the glossary's "What it is" text mentions the
  October 2026 record and would need a look.
- The nightly digest: it may want these results saved rather than recomputed.
