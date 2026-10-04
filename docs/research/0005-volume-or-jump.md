# 0005 — Volume or the jump?

**Date:** 2026-10-04 · Re-run any time: `bun run research:volume-or-jump` (about 75 seconds; `-- --json file` writes the chart data) · Spec:
[`docs/superpowers/specs/2026-10-04-volume-or-jump-design.md`](../superpowers/specs/2026-10-04-volume-or-jump-design.md) · Charts: [`0005-charts.html`](0005-charts.html) (also published as a private page, "Volume or the Jump?")

## The question

Research 0004 found two kinds of day that were followed by stocks doing worse than other
stocks over the next month: **huge volume on an up day** (−0.9 pts) and **heavy-volume
breakouts above the 200-day average** (−1.2 pts). Both are big up days, and big one-day
jumps often give back ground whatever the volume. So: **if we hold the size of the jump
constant, does the volume add anything?**

Example: stock A jumps +9% on 6× its normal volume; stock B jumps +9% in the same month on
1.2× its normal volume, and the two companies are of similar size. If A and B do equally
well over the next month, the jump explains everything and the volume adds nothing.

## The short answer

**The lag after those days comes from the jump, not the volume.** Same-size jumps on
*ordinary* volume lagged even more. Whether heavy volume actually *helps* is **not settled**:
the two methods we fixed in advance disagree.

| Question | Next month: heavy volume vs ordinary volume, same jump | 2023– check | Second method | Verdict |
|---|---|---|---|---|
| **Huge volume (≥ 5×) vs ordinary (< 1.5×)**, jumps of +3% or more | **Ahead by 1.06 pts** (8,915 matched cases), beat every random draw | Ahead by 0.41 pts, beat 99.9% | Regression: **no volume effect** in 2016–22 (t = 0.00); weak and positive since 2023 (t = 2.57, short of the 3 bar) | **Not settled** |
| **Breakouts: heavy (≥ 2×) vs light (< 1.5×) volume**, same jump | Behind by 0.29 pts (2,818 cases), beat 3.6% | Ahead by 0.07 pts | Not run (too few breakouts per day) | **The jump explains it** (one method) |

**In one line:** a big up day on huge volume is followed by a weaker month than the typical
stock, but a same-size jump on quiet volume is followed by an even weaker one. Volume is not
the warning sign; the jump is.

**What the verdicts mean.** "Volume adds" needed the matched comparison to pass every rule
in both periods *and* the regression to agree with a t of at least 3. "The jump explains it"
needed the gap under 0.3 pts in both periods. Anything else is "Not settled".

## How to read the numbers

- **"pts" means percentage points**, the gap between two returns. Every return here is
  measured against the typical stock on the same day, so a market rally or crash cancels
  out. Example: huge-volume jumps returned −0.8% against the typical stock, matched
  ordinary-volume jumps −1.9%, so the gap is +1.1 pts in favour of huge volume.
- **"Matched"** means compared only with ordinary-volume days in the same calendar month,
  the same jump size (+3–5%, +5–8%, +8–12%, +12% or more; breakouts: under 1%, 1–3%,
  3–5%, 5–8%, 8% or more) and the same company-size third that day (by median trading
  turnover over 20 sessions).
- **"Beats controls"** is the luck check: 1,000 times, each heavy-volume day is swapped for
  a random ordinary-volume day from its own group. 100% "better" means the real result
  beat all 1,000 random swaps.
- **t** measures how sure the regression is. Around 2 is the usual bar in textbooks; we
  fixed **3** in advance (Harvey, Liu & Zhu 2016), because many people have tested many
  ideas on the same markets, and some pass 2 by luck.

## Results

### Q1. Huge-volume jumps vs ordinary-volume jumps

The matched comparison passed every rule: 8,915 matched cases in 2016–22, strength 100%,
a gap of +1.06 pts (well over the 0.5 cost bar), the same side at all four other spans, and
confirmed in 2023– (+0.41 pts, beat 99.9%). The gap grows with time: +0.10 pts at a week,
+1.06 at a month, +3.59 at six months in 2016–22 (+1.43 at six months since 2023).

**The regression didn't agree.** Across every up day, with the jump, the previous month's
return and company size held constant, volume's average effect in 2016–22 was −0.00006
per unit of ln(volume ÷ normal), with t = 0.00: nothing at all. Since 2023 it was +0.151
(t = 2.57), which for a 5× day works out to about +0.24 pts a month: positive, small, and
short of the bar.

**Why the two methods can disagree.** The matched comparison looks at the extremes: 5×
volume against under 1.5×, on jumps of +3% or more. The regression uses every up day,
mostly small ones, and assumes volume works on a sliding scale. The matched edge sits
mostly in the larger jumps (+8–12%: +2.03 pts in 2016–22, +1.50 since 2023), while in
+3–8% jumps, the most common, it is small (+0.25 to +0.47 in 2016–22, about zero since).
An effect that lives only in big jumps on extreme volume would be diluted to nothing in a
regression over all up days.

**What the regression does show clearly: the jump itself.** Each extra 1% on the day was
followed by 0.163 pts less over the next month in 2016–22 (t = −4.92), and 0.092 pts less
since 2023 (t = −2.94, just short of the bar). Example: a +10% day was followed by about
1.6 pts less than a flat day for an otherwise similar stock in 2016–22, about 0.9 pts less
since 2023.

### Q2. Heavy-volume breakouts vs light-volume breakouts

Across the whole market, heavy-volume breakouts lagged matched light-volume breakouts by
0.29 pts in 2016–22 (beat 3.6%, i.e. "worse" with strength 96.4, just short of the 97.5
bar) and were ahead by 0.07 pts since 2023. Both are under the 0.3 line, so the verdict is
"The jump explains it". That is a close call: −0.29 is only just under 0.3. By jump size the
results swing from one period to the next (+8% or more: −1.94 in 2016–22, +4.07 since 2023,
on 376 and 419 cases), so no size band tells a steady story.

### Side check: the bigger stocks (no verdict)

The spec asked for the same comparison with **sector** added to the groups, on the ~750
Nifty Total Market stocks. Its results pointed the other way from the main ones, so after the
first run we added one more row, the same stocks **without** sector (marked †), to tell apart
the two possible reasons: the smaller set of stocks, or the finer groups.

| | 2016–22 gap | 2023– gap | Matched (left out) |
|---|---|---|---|
| Huge volume · whole market | +1.06 | +0.41 | 8,915 (1,542) |
| Huge volume · bigger stocks † | +0.37 | −0.04 | 4,053 (1,120) |
| Huge volume · bigger, by sector | −0.48 | −0.67 | 2,458 (2,722) |
| Breakout · whole market | −0.29 | +0.07 | 2,818 (801) |
| Breakout · bigger stocks † | −1.10 | −0.88 | 1,523 (615) |
| Breakout · bigger, by sector | −0.89 | −1.33 | 607 (1,532) |

- **Huge volume:** the edge is weaker among bigger stocks (+0.37, then about zero) and turns
  negative when sector is added, though that version leaves out more than half its cases.
  The Q1 edge is mostly a smaller-company effect, and it moves with how the matching is
  done. That is one more reason it stays "Not settled".
- **Breakouts:** among bigger stocks, heavy-volume breakouts lagged light-volume ones by
  about 1 point a month, **in both periods, with or without sector**. The whole-market
  result hides this. It is a lead, not a finding: it was not a fixed question, and the †
  row was chosen after seeing results. A follow-up study with this question fixed first
  would settle it (TODO).

## How this fits what others found

- In US stocks, unusually high volume was followed by *higher* returns over the next month
  (Gervais, Kaniel & Mingelgrin 2001). Our matched result leans the same way, for smaller
  Indian companies in 2016–22.
- Individual investors pile into attention-grabbing stocks (big volume, extreme one-day
  moves), which then underperform (Barber & Odean 2008). Here the "extreme one-day move"
  half is what carries the weakness.
- Indian stocks reverse after large price moves, more after bigger ones. Our regression's
  jump coefficient is that reversal, measured on our own data.

## Caveats (please read)

- **Two questions, two methods, several side checks.** Only the fixed verdict rules decide;
  the band table and the bigger-stock rows are descriptions. The † row was added after
  the first run and is labelled everywhere it appears.
- **Left out for lack of a match:** 15% of huge-volume jumps (1,542 in 2016–22, 1,930 since
  2023) and 22% of heavy-volume breakouts (801 and 1,037) had no ordinary-volume day in
  their group. Their results aren't in the comparison.
- **Size, not sector, in the main matching.** Company size is ranked on each day's own
  turnover, so no future information leaks in. Sector comes from today's NSE list (only
  for the side check).
- **Liquid companies only** (₹1 crore a day median turnover), ETFs left out, as in 0003
  and 0004.
- **Medians, not guarantees.** Plenty of single stocks did the opposite.

## Method

As specified, with two rulings made before any result was seen (Q2's own jump-size bands,
since breakouts are mostly small moves; signal days merged into episodes per stock within
10 sessions, as in 0004) and one side row added after (†, above). Signals and controls:
the day's move uses the adjusted close with the 5-day gap rule; volume ratio against the
previous 20-session mean; thresholds allow 1e-9 so a computed 4.999999999999999× counts as
5×. Excess return = the stock's return from the next session's close minus that day's
median among eligible stocks. Matched comparison and luck check: research 0003's `part`,
with each group playing the role of a day. Regression: for each session, least squares
across eligible up days (at least 100 stocks; 1,462 days in 2016–22, 888 since), averaged
over days with Newey–West errors (20 lags, since one-month returns that start on
neighbouring days overlap). Spot check: in the first 300 companies, all 2,875 huge-volume
jump days are also 0004 "huge volume, price up" days. Code:
`src/research/volume-or-jump.ts` (tested in `tests/volume-or-jump.test.ts`) and
`cli-volume-or-jump.ts`.

## What this means for the app

- **Unusual activity page:** **don't** add a caution line that blames huge volume. Days with
  huge volume on a rising stock did lag the typical stock (study 0004), but same-size jumps
  on quiet volume lagged more, so a line saying "huge volume is a warning" would point at
  the wrong cause. If a line is wanted, the supported one is about the jump: *"Big one-day
  jumps have tended to give back some ground over the next month (studies 0004, 0005)."*
  Owner's call.
- **Screener:** keep heavy-volume crossings neutral, as now. Across the whole market, heavy
  and light breakouts did about the same; among bigger stocks heavy ones did worse (a lead).
  Don't present heavy volume as confirmation.
- **Next study (proposed):** heavy vs light breakouts on the bigger (~750) stocks only,
  rules fixed first.

## Appendix: full results (generated)

### Matched comparison (1 month = 21 sessions; excess over the day's typical stock; discovery 2016–2022, hold-out 2023–)

| Question | Signal days matched | Left out (no control in group) | Median signal | Median matched control | Beats controls | Same way | Effect | 2023– matched | 2023– effect | 2023– beats | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Q1. Huge-volume jumps (≥ 5×) vs ordinary-volume jumps (< 1.5×), same jump size | 8915 | 1542 (+1930 in 2023–) | -0.8% | -1.9% | 100.0% (better) | 4 of 4 | +1.06 pts | 10834 | +0.41 pts | 99.9% (better) | Not settled |
| Q2. Heavy-volume breakouts (≥ 2×) vs light-volume breakouts (< 1.5×), same jump size | 2818 | 801 (+1037 in 2023–) | -0.7% | -0.4% | 3.6% (worse) | 2 of 4 | -0.29 pts | 3594 | +0.07 pts | 80.1% (better) | The jump explains it (one method) |

### Gap at each span (signal median − matched control median, pts)

| Question | 5d | 10d | 21d | 63d | 126d |
|---|---|---|---|---|---|
| Q1 2016–22 | +0.10 | +0.57 | +1.06 | +2.74 | +3.59 |
| Q1 2023– | -0.19 | +0.16 | +0.41 | +1.45 | +1.43 |
| Q2 2016–22 | -0.26 | -0.52 | -0.29 | +0.20 | +0.27 |
| Q2 2023– | +0.02 | +0.28 | +0.07 | -1.44 | -0.57 |

### Fama–MacBeth (Q1's second method): daily fits across eligible up days, ≥ 100 stocks, Newey–West 20 lags

| Term | 2016–22 average | t | 2023– average | t |
|---|---|---|---|---|
| **ln(volume ÷ normal)** | 0.000 | 0.00 | +0.151 | +2.57 |
| Day's move (per %) | -0.163 | -4.92 | -0.092 | -2.94 |
| Previous 21-session return (per %) | +0.018 | +1.84 | +0.008 | +0.95 |
| ln(median turnover) | -0.179 | -2.19 | +0.036 | +0.44 |

Days fitted: 1462 (2016–22), 888 (2023–); skipped for fewer than 100 stocks or a singular fit: 68, 20. Bar: |t| ≥ 3.

### Gap by jump size (1 month, pts)

| Question | Jump | Matched 2016–22 | Effect | Matched 2023– | Effect |
|---|---|---|---|---|---|
| Q1 | +3 to +5% | 2185 | +0.47 | 2598 | +0.06 |
| Q1 | +5 to +8% | 3274 | +0.25 | 4315 | -0.17 |
| Q1 | +8 to +12% | 2651 | +2.03 | 3181 | +1.50 |
| Q1 | +12% or more | 805 | +1.93 | 740 | -0.13 |
| Q2 | under +1% | 61 | -0.12 | 91 | -0.17 |
| Q2 | +1 to +3% | 604 | +0.51 | 726 | +0.12 |
| Q2 | +3 to +5% | 953 | -0.35 | 1205 | -0.70 |
| Q2 | +5 to +8% | 824 | -0.52 | 1153 | +0.62 |
| Q2 | +8% or more | 376 | -1.94 | 419 | +4.07 |

### Secondary: sector added to the groups (Nifty Total Market stocks only; no verdict)

Rows marked † were added after the first run, to tell apart the two reasons the sector rows could differ from the main result: the smaller set of stocks, or the finer groups.

| Question | Matched 2016–22 | Left out | Effect | Beats | Matched 2023– | Effect |
|---|---|---|---|---|---|---|
| Q1, Total Market, with sector | 2458 | 2722 | -0.48 | 0.1% (worse) | 3019 | -0.67 |
| Q1, Total Market, no sector † | 4053 | 1120 | +0.37 | 95.5% (better) | 4513 | -0.04 |
| Q2, Total Market, with sector | 607 | 1532 | -0.89 | 0.0% (worse) | 798 | -1.33 |
| Q2, Total Market, no sector † | 1523 | 615 | -1.10 | 0.0% (worse) | 1606 | -0.88 |
