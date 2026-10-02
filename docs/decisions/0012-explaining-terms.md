# 0012 — Explaining every term in the app

**Date:** 2026-10-02 · **Status:** done ·
Spec: `docs/superpowers/specs/2026-10-02-explain-terms-design.md` ·
Plan: `docs/superpowers/plans/2026-10-02-explain-terms.md`

## Problem

The app is meant to be sold. A buyer who has never traded sees "200-day SMA", "Net
advances", "McClellan", "Summation index", "Bumpiness"… and has no way to find out what
they mean, how they're worked out, or whether today's number is good or bad. Without
that, the numbers are noise to the people the product is for.

## Options

| Option | Good | Bad |
|---|---|---|
| **A. One glossary file; the ⓘ popovers and the Learn pages are both built from it** ✅ | One definition per term, so the popover and the page can never disagree; a typo in a term name is a type error; a test checks every entry is complete | Every new metric needs an entry (that's the point) |
| B. Write the explanation next to each label, in each page | Quick for one page | The same term explained differently on three pages; nothing stops a new metric shipping unexplained |
| C. A separate help site or PDF | No code | Nobody leaves the app to read a manual; it goes out of date silently |

## Decision

- **`src/lib/glossary.ts`** holds all 28 terms in six topics (Basics, Moving averages,
  Breadth, Advance/Decline, Stocks, Risk). Each has a short definition (fits a popover),
  how to read it, a full explanation, the formula in words (and exactly, where it helps),
  a worked example with round numbers, common mistakes, and related terms.
- **An ⓘ next to every tile label and card title** (`<Term>`, `src/components/Term.tsx`).
  Click, Enter or Space opens it; Esc or a click outside closes it, and focus goes back to
  the ⓘ. It shows the definition, how to read it, **today's value** from the page, and
  "Read more →". Table column headers get a hover hint instead, to keep tables clean.
- **`/learn`** lists every term by topic with a filter box (sidebar "Help → Learn", key
  `l`). **`/learn/<term>`** has seven sections, ending in "Today in tradeSence": one real
  sentence about the latest session (`src/query/glossary-live.ts`), from the same queries
  the pages use, plus a link to where the term appears.
- Every Learn page ends with *"Explanations are educational. Nothing in tradeSence is
  advice to buy or sell."*

## Why

- **One source of truth** is the only way 28 definitions stay consistent as the app grows.
- **Explaining in place** (the ⓘ) answers the question where it's asked; the Learn page is
  there for anyone who wants the full story.
- **A real example from today** makes an abstract formula concrete ("On 1 Oct 2026: −24
  (13 rose, 37 fell)") — and because it uses the pages' own queries, it can't disagree
  with what's on screen (one exception, below: the Crossings "Calmest" tile).

## Problems met while building it

- **"3th percentile"**: the live sentence used `toFixed`; it now uses `ordinal()` ("33rd").
- **The "calmest stock" was a new listing.** BSE joined the index recently and had 0
  crossings simply because it had no history. Whipsaw examples now only consider stocks
  with at least 250 sessions.
- **The NIFTY 50 example repeated the breadth one.** It now quotes the index close instead.
- **No placeholder lines.** A popover's "Today:" line is left out when the value is "—" or
  "Not enough history", rather than showing "Today: —".
- **Keyboard shortcuts fired while a popover was open** (pressing `b` would have left the
  page). The shortcut handler now ignores keys while focus is inside a popover.
- **`/learn/__proto__` and `/learn/constructor`** would have matched built-in object
  properties with a naive lookup. Term ids are checked against a fixed list; both 404.

## Found by the independent review (fixed)

A fresh reviewer checked the whole change, including every glossary explanation against
the code that computes it (all correct). No critical problems. Fixed, each with a test that
failed first:

- **"Today:" showed long-run numbers as if they were today's.** The "Average since 2020"
  tile's ⓘ said "Breadth… Today: 52%" on a day when breadth was 16%. A tile now only feeds
  "Today:" when it *is* the term's current reading; "Average since 2020", "One-year range",
  "Advancing sessions" and the four Crossings tiles show no "Today:" line.
- **The whipsaw example named an ex-member** (GAIL, which left the index years ago) as the
  calmest stock, just because it had fewer sessions to cross in. It now ranks only today's
  members, by crossings per year: "ONGC… about 3.0 times a year".

Deferred (small, in the branch summary and TODO): "Today:" on a past date should say the
session's date; `/learn/ema` has no live example yet; the ⓘ is a small tap target on
phones; a few constants (1%, 'Nifty 50') are repeated in the live examples; errors in a
live example are hidden rather than logged. The Crossings page's own "Calmest" tile still
includes ex-members (older behaviour, not changed here).

## Checks

- Tests: every entry complete, related terms exist, short definitions ≤ 220 characters,
  true minus signs; live examples return nothing (never crash) on an empty database and a
  real sentence with data.
- In the browser (headless Chrome, 1440 px and 390 px): no ⓘ sits inside a link or a
  button on any page; Enter opens the "Net advances" popover with "Today: −24 (13 rose, 37
  fell)", `b` does nothing while it's open, Esc closes it and focus returns; "Read more"
  lands on `/learn/net-advances` with today's sentence; on a phone the popover stays inside
  the screen; the filter "mcc" shows McClellan and the Summation index (its definition
  mentions McClellan).
- URLs: `/learn`, `/learn/mcclellan`, `/learn/net-advances` → 200; `/learn/nope`,
  `/learn/__proto__`, `/learn/constructor` → 404.

## Revisit when

- **A new metric, tile or card title is added:** it needs a glossary entry and a `<Term>`
  before it ships (rule in CLAUDE.md).
- **Diagrams:** small pictures for SMA vs EMA and for a drawdown would help (TODO).
- **Translations** (Hindi, etc.): the glossary is the one file to translate.
