# Explaining terms in the UI (glossary, info popovers, Learn pages) — design

**Date:** 2026-10-02 · **Status:** awaiting owner review · **Path:** architectural

## Intent (agreed)

- **Why:** the app is meant to be sold as a product. A newcomer must understand every term
  on screen (SMA, EMA, breadth, net advances, McClellan…) without leaving the app or
  reading a manual.
- **Success:** from wherever a term appears, a beginner can learn in one or two clicks
  what it means, how to read it, and an example: a fixed worked one and today's real one.
- **Constraints:** follow the design system and tone (plain, exact, no hype, no tips:
  education, not advice); keyboard and phone accessible; don't clutter screens for people
  who already know the terms; **one source of truth per definition**.
- **Owner's choices:** info popovers **plus** a Learn page; examples are **both** a fixed
  worked example and a live "today" line.
- **Assumptions:** English only; no sign-up or tracking.

## Approach

**One typed glossary module, `src/lib/glossary.ts`** (approach A). Every term is one
entry; the popover component and the Learn pages are generated from it. TypeScript
rejects an unknown term id, and a test checks that every entry is complete. No new
dependencies (shadcn Popover is already installed).

## The glossary entry

```ts
type TermId = "sma" | "ema" | ...;          // a union, so <Term id="…"> is type-checked
type GlossaryEntry = {
  id: TermId;
  term: string;              // "McClellan oscillator"
  topic: Topic;              // "Moving averages" | "Breadth" | "Advance/Decline" | "Stocks" | "Risk" | "Basics"
  short: string;             // 1–2 sentences, the popover's definition
  read: string;              // one line: how to read it
  what: string;              // Learn page: what it is (a paragraph)
  calc: { plain: string; exact?: string };   // the formula in words, and exactly
  example: string;           // fixed worked example with round numbers
  mistakes: string[];        // common misreadings (≥ 1)
  related: TermId[];         // must all exist
  seeIt?: { label: string; href: string };    // where it appears in the app
};
```

## Terms (v1: everything on screen today, about 29 entries)

| Topic | Terms (id) |
|---|---|
| Basics | `nifty50`, `session`, `membership` |
| Moving averages | `sma`, `ema`, `ma-50-200` (the 50- and 200-day averages and why those lengths) |
| Breadth | `breadth` (% above the average), `percentile`, `five-session-change` |
| Advance/Decline | `advancers-decliners`, `net-advances`, `rana`, `mcclellan`, `summation-index`, `ad-line`, `advancing-share-10d`, `breadth-thrust` |
| Stocks | `crossing`, `whipsaw` (past crossings, Calm/Typical/Busy), `volume-ratio` (volume vs 20-day), `near-the-line` |
| Risk (Report Card) | `trend-check`, `relative-strength`, `volatility` (Bumpiness), `drawdown` (Worst fall, recovery), `liquidity` (turnover), `stretches` (overlapping stretches, 1-in-10), `adjusted-prices` (splits, bonuses, demergers, renames) |

That's 29 ids; `ma-50-200`, `five-session-change` and `adjusted-prices` may fold into
neighbours while writing if they read as duplicates. The test fixes the final list.

## The popover: `<Term id="mcclellan" today="−58.8: below zero for 4 sessions">McClellan</Term>`

- Renders the label (children) followed by a small ⓘ button (lucide `Info`, 14px,
  `muted-foreground`, `brand` on hover/focus). The button's accessible name is
  "What is McClellan?".
- **Click, Enter or Space opens; Esc or a click outside closes** (Radix Popover gives this).
  Focus moves into the popover and returns to the ⓘ on close.
- Content, max 18rem wide: **term** (heading), **short**, "**How to read it:** read", an
  optional "**Today:** …" line from the `today` prop (the page passes its own live value;
  omitted if not given), and "**Read more →**" to `/learn/<id>`.
- On phones it opens as the same popover (Radix positions it within the viewport).

**Placement:** next to every metric label, tile label and card title (above list), on all
pages. **Not** on table column headers: those get a `title` hover hint with the `short`
text, to keep tables clean. Each term gets an ⓘ only at its first appearance in a card,
not every time.

## The Learn pages

- `/learn`: all entries grouped by topic, with a filter box (same pattern as `/stock`),
  and a sidebar entry "Learn" in a new **Help** group (key `l`).
- `/learn/[id]`: an unknown id gives a 404. Sections, in order:
  1. **What it is** (`what`)
  2. **How it's calculated** (`calc.plain`, then `calc.exact` in a mono block if present)
  3. **How to read it** (`read`)
  4. **Worked example** (`example`)
  5. **Today in tradeSence**: the live example (below), with `seeIt` linking to where it appears
  6. **Common mistakes** (`mistakes`)
  7. **Related terms** (links)
- Copy follows the design system voice; the "not advice" line appears on every Learn page footer.

## Live examples (`src/query/glossary-live.ts`)

`liveExample(id): Promise<string | null>`. One short sentence per term, from the **same
queries the pages use** (`breadthSeries`, `advanceDeclineSeries`, `screenerOn`,
`stockReport`), for the latest session. For example:
- `net-advances` → "On 1 Oct 2026: −24 (13 rose, 37 fell)."
- `sma` → "KOTAKBANK closed ₹418.35 on 1 Oct 2026; its 200-day SMA was ₹400.05."
- `drawdown` → "M&M's worst fall since 2016 was −73% (Aug 2018 → Mar 2020)."

It returns **null when there's no data**, and the page then says "Not available for today."
Terms with nothing live to show (`session`, `membership`) return a fixed fact instead
(e.g. the latest session's date, "50 members, last changed 30 Sep 2026: WIPRO → BSE").

## Data flow

Pages already have their numbers and pass a `today` string to `<Term>`. `/learn/[id]`
calls `liveExample(id)` server-side. The glossary module is plain data shared by both.

## Errors and edge cases

- Unknown term id in code → **type error** at build time; in the URL → 404.
- No data loaded → popovers omit "Today"; Learn says "Not available for today."
- Very long `today` strings are kept to one line by the page (the component doesn't truncate).

## Testing

- `tests/glossary.test.ts`: every entry has every field non-empty; `mistakes` has ≥ 1;
  every `related` id exists and isn't itself; ids are unique; `short` ≤ 220 characters
  (fits the popover); every topic has ≥ 1 entry.
- `tests/glossary-live.test.ts` (test DB): `liveExample` returns null on an empty
  database for every id (never throws), and a real sentence for `net-advances` and
  `sma` with seeded data.
- Browser check (headless Chrome, scripted): ⓘ opens with Enter, closes with Esc, focus
  returns, "Read more" goes to `/learn/<id>`; `/learn` filter works; `/learn/nope` 404s.

## Out of scope (v1)

Guided tours, pictures/diagrams in Learn pages (later: small inline SVGs for SMA vs EMA
and the drawdown), search across the whole app, translations.

## Documentation

`docs/decisions/0012-explaining-terms.md`; CLAUDE.md rule: **every new metric or label
needs a glossary entry and a `<Term>` before it ships**; README function reference;
TODO updated.
