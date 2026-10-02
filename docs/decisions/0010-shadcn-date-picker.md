# 0010 — Use shadcn's date picker for choosing a session

**Date:** 2026-10-02 · **Status:** done

## Problem

The owner asked for the session selector to use shadcn instead of the browser's own
date box. The old control was a plain `<input type="date">` plus a "Go" button: its look
differs from browser to browser, it ignores the design system, and moving years back
(to March 2020) meant clicking through dozens of months.

## Decision

shadcn's **Date Picker** pattern (Popover + Calendar, `src/components/DatePicker.tsx`),
used inside `DateNav` on every page that has one (Breadth, Advance/Decline, Screener):

- The trigger is a button showing the session ("1 Oct 2026"); it opens a calendar.
- **Month and year dropdowns** jump straight to any month.
- Days before the history starts and after the latest session are **disabled**. The year
  dropdown starts at 2020.
- **Picking a day navigates immediately**, so the "Go" button is gone. The page's other
  settings stay in the URL (e.g. the Screener's view and volume filter).
- **Weekends stay selectable.** NSE trades on some ([0007](0007-weekend-trading-sessions.md)),
  and any day that wasn't a session snaps back to the one before it with a note
  ("27 Sep 2026 was not a trading session. Showing 25 Sep 2026.").
- Dates are built field by field in local time, so a timezone can never shift the
  chosen session by a day.

Added with `bunx shadcn@latest add calendar popover`. It brought `react-day-picker`
(v10), `@radix-ui/react-popover` and `date-fns`. The CLI asked whether to overwrite
`button.tsx` and was told **no**: ours is customised for the design system.

## A problem found while doing it: Tailwind v3 syntax from the CLI

The calendar first rendered with its arrows on top of the month/year dropdowns. Cause:
`components.json` uses shadcn's `"default"` style, which generates **Tailwind v3**
syntax. This project runs **Tailwind v4**:

| v3 (what the CLI wrote) | v4 (what works here) |
|---|---|
| `h-[--cell-size]` | `h-(--cell-size)` |
| `origin-[--radix-popover-content-transform-origin]` | `origin-(--radix-popover-content-transform-origin)` |

v4 silently ignores the v3 form, so the sizes and padding never applied. It was fixed by
rewriting every `[--var]` to `(--var)` in `calendar.tsx` and `popover.tsx`. (A
*declaration* like `[--cell-size:2rem]` is valid in both and stays.)

## Why

- **It's what was asked**, and it looks the same in every browser, in both themes.
- **Faster to use**: year and month dropdowns instead of clicking back month by month.
- **Fewer ways to go wrong**: impossible dates are disabled, and holidays still snap with
  a visible note.

## Checks (headless Chrome, driven by script)

- The calendar opens, with the selected day highlighted and future days disabled.
- Picking 29 Sep on the Screener goes to `date=2026-09-29` and keeps `view=below&vol=any`.
- Year → 2020, month → March, day 23 goes to `date=2020-03-23`.

## Revisit when

- **Adding any other shadcn component**: check its output for `[--` and convert it (see
  CLAUDE.md). Or switch `components.json` to a v4 style, then re-check `button.tsx`,
  `badge.tsx`, `card.tsx`, `table.tsx` and `chart.tsx`, which are customised.
