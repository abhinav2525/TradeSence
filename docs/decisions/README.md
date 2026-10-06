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
| [0007](0007-weekend-trading-sessions.md) | 2026-10-02 | 10 weekend sessions (Budget days, Diwali Muhurat, NSE special Saturdays) were never loaded because the downloader skipped weekends | Fetch every calendar day; an ordinary weekend is recorded as a holiday |
| [0008](0008-measuring-a-days-move.md) | 2026-10-02 | Advance/Decline needs each stock's daily move, but NSE's `prev_close` is wrong on split/demerger days and blind to renames | Store the move from the adjusted, rename-joined series (`change_pct`); gap rule moved to one module |
| [0009](0009-screener.md) | 2026-10-02 | Screener needed a volume ratio splits can't fake, a gap-proof crossing rule, and a filter that agrees with what it displays | Stored 20-session `vol_ratio` (split/bonus-scaled, never demerger); crossings as on the Crossings page; filter on the displayed value |
| [0010](0010-shadcn-date-picker.md) | 2026-10-02 | The session selector was the browser's plain date box; shadcn's CLI then generated Tailwind v3 syntax that v4 ignores | shadcn Date Picker (Popover + Calendar) with month/year jumps; `[--var]` rewritten to `(--var)` |
| [0011](0011-stock-report-card.md) | 2026-10-02 | A beginner had no way to see how risky one stock is, or what a bad stretch would cost | `/stock/[symbol]`: five lights relative to the NIFTY 50, rupee risk calculator, all from the stored adjusted moves; checked against TradingView |
| [0012](0012-explaining-terms.md) | 2026-10-02 | Buyers had no way to learn what SMA, McClellan, Net advances and the other terms mean | One glossary file feeds ⓘ popovers on every page and `/learn` pages, each with a worked example and today's real number |
| [0013](0013-independent-audit-and-rounding.md) | 2026-10-02 | How do we know the Report Card is right? An independent recalculation found the Strength rank 2 points low for 26 of 50 stocks, and flat months counted as losses: both decimal-equality bugs | Rank against the *other* members by symbol, compare returns with a 1e-9 tolerance; `bun run audit:report-card` checks all 750 numbers |
| [0014](0014-three-new-lights.md) | 2026-10-02 | A beginner couldn't see whether a stock is unusually jumpy now, falls harder on bad days, or how it did in crashes | Three new Report Card lights (RiskMetrics volatility, down capture, crash episodes), each audited from raw prices with 0 mismatches |
| [0015](0015-app-motion.md) | 2026-10-02 | The app felt flat: nothing moved | Polished, quick motion with built-in tools (cards rise, figures count, charts draw, switches slide, pages fade), four rules so numbers stay trustworthy; fixed popovers that never animated |
| [0016](0016-chart-tooltip-v3-syntax.md) | 2026-10-03 | Chart tooltips' colour square used Tailwind v3 `[--var]` syntax, which v4 ignores | Rewritten to `(--var)`; a test now fails on any v3 leftover in `src` |
| [0017](0017-signals-washout.md) | 2026-10-03 | Signals page: the breadth washout alarm, with what happened next | Washout only (thrust and divergence wait for their studies), 200-day SMA only, computed live; one shared episode rule; research 0001 refreshed after the weekend-sessions shift |
| [0018](0018-claude-code-guards-and-db-access.md) | 2026-10-03 | Rules protecting test data and migrations could be forgotten; AI sessions needed safe database reads | Guard and typecheck hooks; read-only `claude_ro` role + Postgres MCP Pro (pinned to Python 3.12 and mcp<2; the official server is deprecated) |
| [0019](0019-claude-design-system-sync.md) | 2026-10-03 | The app's components had to work in Claude Design, which expects a component package | All 45 synced, 21 graded previews; entry file, generated types, compiled Tailwind CSS, ThemeRoot (dark + stand-in router), env shim; MaTabs labels moved to src/lib/ma.ts |
| [0021](0021-sector-tags.md) | 2026-10-06 | The owner couldn't tell which sector a stock in the tables belongs to | Hand-kept map of NSE's "Industry" name for every NIFTY 50 member since 2020 (`src/lib/sectors.ts`); a Sector column on Breadth's Above/Below tables and the Screener; the Screener filter also matches sectors; a live test checks it against NSE's list |
| [0020](0020-ui-density.md) | 2026-10-04 | Too little fit on one screen | `data-density` on `<html>`, compact by default (smaller type, padding, gaps, rows, 70% charts, Breadth/A-D tiles in one row); comfortable remembered per browser, applied before first paint; sidebar button and `d` key |
| [Research 0001](../research/0001-does-breadth-predict.md) | 2026-10-02 | *(study, TODO item 2)* Does breadth predict the NIFTY 50? | Very weak 200-SMA breadth (<20%) was followed by a higher index 6 months later 5/5 times; >80% has no edge. Small sample |
| [Research 0002](../research/0002-does-volume-predict.md) | 2026-10-03 | *(study)* Does volume tell us anything on the NIFTY 50? | None of 15 volume signals (90% days, up-volume share, CMF, MFI, OBV, volume-confirmed crossings) beat random days; CMF and MFI match TradingView exactly. Volume page, light and breakouts not built as signals |

Research studies (questions answered with data, not problems fixed) live in
[`docs/research/`](../research/):
[0001 — Does breadth predict the NIFTY 50?](../research/0001-does-breadth-predict.md),
[0002 — Does volume tell us anything?](../research/0002-does-volume-predict.md)

Older decisions, made before this log existed, are recorded in `CLAUDE.md` under
"Design decisions that are load-bearing" and "Gotchas that will bite you".
