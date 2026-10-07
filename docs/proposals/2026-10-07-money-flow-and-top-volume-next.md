# What to add to Money flow and Top volume (quant advisor, 7 Oct 2026)

The owner asked: "What good features should we add to Money flow (/money-flow, decisions
0028/0029) and Top volume (/volume, decision 0025)?"

Ground rules for this list. Research 0002 to 0005 found no tradable edge in volume or delivery,
and big up-day jumps lag, so nothing here is a buy or sell signal. Every idea below is
**tracking** (it shows facts). Each one either makes the pages harder to misread or shows a
new side of where trading money goes. Data: only tables we already hold. All numbers come from
the read-only database on 7 Oct 2026 (latest session 6 Oct 2026). The queries are summarised
under each idea.

## 1. "One stock or the whole sector?" on Money flow (top pick)

**What the owner sees.** Next to each sector's "× normal" bar, two plain facts:
"busier than usual: 2 of 8 stocks" and "without its biggest mover: 0.74×".

**Real example (week to 6 Oct 2026).** Media, Entertainment & Publication reads **1.78×**,
the busiest sector on the page. But SUNTV alone traded about ₹2,950 crore more than its normal.
That is more than the whole sector's extra ₹2,232 crore, so the other seven stocks together
were *quieter* than usual. Only 2 of the 8 stocks were busier than normal, and without SUNTV the
sector is at **0.74×**. Construction Materials goes from 1.23× to 1.01× without SHREECEM.
Construction (1.38× to 1.24×, 8 of 23 busier) is a broader move.

**Why it's useful.** This is information, not a signal. Today the bar tempts a reader to think
"money is moving into media" when one company had news. These two numbers tell the reader
whether a sector's move is a single-stock story or a sector-wide one. That is the question the
page exists to answer.

**Data.** `money_flow` (period, symbol, sector, turnover, normal_daily, sessions). It is all
there already.
**Effort.** About ½ day. It is a sum on the page plus a glossary entry.
**Study?** No.
**Traps.**
- Use the same rules as the ratio: leave out new listings and stocks that didn't trade
  (decision 0028's fix).
- "Biggest mover" means the stock with the largest extra rupees, chosen from that period's
  data only.
- In sectors of exactly 5 stocks, the "without" figure is jumpy. Show it, but the
  "x of y busier" count is the steadier of the two.

Query: per sector, sum(turnover) ÷ sum(normal_daily × sessions) for period 5, with and without
the stock that has the largest (turnover − normal) in that sector; plus a count of stocks with
turnover > normal.

## 2. "× its own normal" column and sort on Top volume

**What the owner sees.** A column showing each stock's trading against its own usual
(the same 63-session normal Money flow uses), and a sort option "Unusually busy".

**Real example (week to 6 Oct 2026).** By ₹, BSE is #1 (₹17,845 crore, 2.74× its normal) and
HDFCBANK #2 (₹15,158 crore, only 1.36×). Sorted by "× normal" among stocks that usually trade at
least ₹5 crore a day: SUNTV 22.9× (ranked #24 by ₹), IRCON 13.7× (#109 by ₹), KSB 9.2× (#235),
ABLBL 9.2× (#326). Today the page shows size. Big banks are always on top. This column shows
*change*.

**Why it's useful.** This is information. It finds the stocks where something happened this
week, which a raw ₹ ranking hides. It is **not** a signal. Research 0004/0005 found heavy
volume does not predict price, and big jumps lag. The column says "busy", never "buy".

**Data.** `money_flow` already holds `normal_daily` per stock for 1/5/21 sessions. The
3- and 6-month tabs need the normal stored in `volume_leaders` (or the column shows "–" there).
**Effort.** About 1 day.
**Study?** No.
**Traps.**
- Tiny stocks give silly ratios (a ₹10 lakh stock at 40×). Apply a floor: the project's ₹1
  crore/day median, or ₹5 crore for this sort.
- New listings have no normal: "–", as on Money flow.
- Muhurat and other short sessions: reuse `short_sessions`.
- BE (trade-for-trade) days are counted, as decision 0025 already does.

## 3. Delivery share by sector, against the market's own change (already in TODO.md "Later")

**What the owner sees.** For each sector: "share of traded shares actually taken home
(delivered) this week vs its normal", next to the whole market's change.

**Real example.** Across the ~750 stocks, delivery rose from **36.4%** (63 sessions before) to
**43.7%** in the week to 6 Oct, so almost every sector rose with it. That market-wide rise is
why this view must show the market beside the sectors. Against the market's +7 points,
Information Technology stands out: **61.2% vs 39.1%** (+22 points). Construction went the other
way: **24.6% vs 36.0%**.

**Why it's useful.** It gives a second view of the same rupees: "held on to" vs "traded
within the day". It is honest information. Research 0003 found delivery signals don't predict
returns, so the page must not suggest "smart money is buying".

**Data.** `daily_delivery`, `money_flow` (sectors), `EXCLUDED_DAYS` from
`src/indicators/activity.ts`.
**Effort.** 1 to 1½ days (nightly table plus a column).
**Study?** No.
**Traps.**
- **Weight by rupees, not shares.** The numbers above are share-weighted, so cheap,
  heavily traded stocks (IDEA, YESBANK) dominate a sector. The build should use delivered ₹ ÷
  traded ₹.
- Skip the five excluded delivery days.
- Quarter-end and ex-dates jump: 29 Sep 2026 read 46.6% market-wide against ~39% around it.
- Sector tags are today's.

## 4. Each sector's share of trading over a year (rotation chart) on Money flow

**What the owner sees.** One line per sector: its share of all ₹ traded, week by week, for
52 weeks.

**Real example.** Over the same four weeks, 7 Sep to 6 Oct, in 2025 and in 2026 (today's
members and sectors):

| Sector | Share of trading, 2025 | Share of trading, 2026 |
|---|---|---|
| Financial Services | 23.4% | 26.1% |
| Capital Goods | 13.1% | 14.5% |
| Healthcare | 5.8% | 7.0% |
| Information Technology | 8.1% | 6.3% |
| Auto | 8.0% | 6.7% |

**Why it's useful.** This is the slow "where is trading money going" picture the owner asked
for, and "× normal" can't show it (its normal moves with the sector).

**Data.** `daily_prices` (turnover, EQ+BE) and today's sectors. Store it in
`sector_flow_weeks` (add a share column).
**Effort.** About 1 day.
**Study?** No.
**Trap: survivorship and listings.** Today's list leaves out stocks that left the index and
includes this year's new listings. That inflates the 2026 share of sectors with big new
listings. Say so under the chart, as decision 0029 does. If a sector's change comes mostly from
stocks that listed during the year, flag it.

## 5. Whole-market total on top of Money flow (= TODO-research item 1)

Two numbers sit above the sectors: all ₹ traded this week vs its normal, and the share traded
outside the 500 most-traded stocks (under 2% in 2019, about 15% in 2026; see
`2026-10-05-what-next.md`). This is tracking work and takes about 1 day. It answers "is the
whole market busier, or is money just shifting around?" It is listed already, so don't
duplicate it. Build it here.

## Where "Who moved the money" (TODO.md) would plug in

- **FII/FPI daily net ₹** goes in a market-level row above the sectors on Money flow ("foreign
  investors net sold ₹X crore this week"). It is a market total only. Daily FII by sector is not
  in that data.
- **Bulk/block deals** get a small marker on stock rows in Money flow's drill-down and on Top
  volume ("2 bulk deals, 3 Oct"). For idea 1, this tells the reader *who* was behind SUNTV's
  week. It only works going forward, as the TODO item says.
- **DII** waits for a source.

## Optional study (low priority): do busy weeks stay jumpy?

Volume and the size of price moves go together, and busy periods tend to stay volatile
(Karpoff 1987; a robust finding worldwide). A study could check whether stocks in the top tenth
of "× normal" this week have bigger daily moves over the next 21 sessions than other stocks on
the same date (`matchedLuck`).

Pass rules, fixed now:
- discovery 2016–2022: the median ratio of next-21-session daily-move spread is ≥ 1.2×, with
  luck-check strength ≥ 97.5;
- hold-out 2023 onward: ≥ 95 one-sided;
- ₹1 crore floor, ETFs out, non-overlapping months.

**Prior: high (about 3 in 4).** But it would only allow one sourced caution line ("busy
stocks tend to stay jumpy"). It never predicts direction. Do it only if the owner wants that
line.

## What's misleading today

1. **Money flow's sector bar hides single-stock weeks** (Media 1.78× is really SUNTV). Idea 1
   fixes this. Until then, the drill-down is the only clue.
2. **Top volume's "Shares" ranking favours cheap stocks.** Over the last month YESBANK is #5 by
   shares but #136 by ₹, and JPPOWER is #6 vs #235. ₹ is the default, which is right. Add one
   line under the switch: "Shares favour low-priced stocks; ₹ compares fairly." The other option
   is to drop the switch. I would keep it with the line, since the owner asked for both.
3. Nothing else to remove. Both pages already say heavy trading isn't a forecast and can be
   selling. Keep that wording.

## Top pick

**Idea 1.** It takes half a day, uses only `money_flow`, and corrects the biggest misreading on
the page right now: this week's top sector is one company.
