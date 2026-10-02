# Decision log

Every problem this project has hit, written down so nobody has to remember it.
Each file answers four questions in plain language:

1. **Problem** — what went wrong, and how we noticed.
2. **Options** — what we could have done.
3. **Decision** — what we did.
4. **Why** — why that option and not the others, and what would make us revisit it.

Add a new file for every new problem (next number, short name), and add a line
to the table below in the same change.

| # | Date | Problem | Decision |
|---|------|---------|----------|
| [0001](0001-nightly-schedule-launchd.md) | 2026-10-02 | Data went stale because the nightly job was never scheduled | launchd agent, Mon–Fri 19:30 IST |
| [0002](0002-split-adjusted-averages.md) | 2026-10-02 | KOTAKBANK showed "below" its 200 SMA/EMA while TradingView showed "above" — splits and bonuses were poisoning the averages | Adjust with NSE's own corporate-actions feed, at compute time |
| [0003](0003-renamed-symbols-lose-history.md) | 2026-10-02 | Renamed stocks (TATACONSUM, SHRIRAMFIN, ETERNAL) lose their history before the rename | Stitch old symbols on at compute time, from NSE's symbol-change list |
| [0004](0004-demerger-adjustment.md) | 2026-10-02 | Demergers (RELIANCE, ITC, TMPV, HINDUNILVR) were never adjusted; TMPV's 200 EMA ~7.5% too high | Ratio from prices (last close ÷ ex-date open), matches TradingView |
| [0005](0005-point-in-time-membership.md) | 2026-10-02 | History used today's 50 stocks for every year (survivorship bias); member list also stale (WIPRO → BSE) | Real membership since 2020 in a hand-checked CSV from NSE press releases, verified 50 every day |
| [0006](0006-nifty50-index-closes.md) | 2026-10-02 | No NIFTY 50 index data for the study; then 3 NSE files (April 2023) wrote dates month-first and failed to load | New `index_prices` pipeline from NSE's daily index file; accept the requested day in either date order, reject any other date |
| [Research 0001](../research/0001-does-breadth-predict.md) | 2026-10-02 | *(study, TODO item 2)* Does breadth predict the NIFTY 50? | Very weak 200-SMA breadth (<20%) was followed by a higher index 6 months later 5/5 times; >80% has no edge. Small sample |

Research studies (questions answered with data, not problems fixed) live in
[`docs/research/`](../research/):
[0001 — Does breadth predict the NIFTY 50?](../research/0001-does-breadth-predict.md)

Older decisions, made before this log existed, are recorded in `CLAUDE.md` under
"Design decisions that are load-bearing" and "Gotchas that will bite you".
