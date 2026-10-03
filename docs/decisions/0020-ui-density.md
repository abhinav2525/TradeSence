# 0020 — Compact by default, comfortable one key away

**Date:** 2026-10-04 · **Status:** done

## Problem

Too little fit on one screen. On Breadth, the headline, the four tiles and the chart
didn't fit together on a laptop, and tables showed only a dozen rows before scrolling.
The owner asked for everything tighter: less padding inside cards, smaller gaps between
them, a smaller page margin, smaller headline and tile numbers, shorter table rows and
charts, and the four Breadth tiles in one row. They also wanted the old spacing available
behind a switch.

## Options

1. **Shrink everything once.** Edit every padding and size by hand. Simple, but there's no
   way back, and the next change means editing the same 30 files again.
2. **A React setting** that swaps classes in each component. It would show the wrong
   density for a moment on every page load (React starts after the page is drawn), and
   every component would need to know about it.
3. **One attribute on the page, CSS variables behind it.** Each size the switch controls
   (card padding, gaps, page margin, row height, chart height, four type sizes) becomes a
   named setting with a compact value and a comfortable value. The page uses the names;
   flipping `data-density` on `<html>` swaps every value at once.

## Decision

Option 3, with **compact as the default**. The server always sends `compact`. A small
script that already runs before the first paint (it applies the light theme) applies a
stored `comfortable` choice, so the page never draws compact and then jumps. The switch is
a button under the theme toggle in the sidebar (an icon in the phone top bar) and the
**d** key. The choice is remembered per browser.

Why: one place holds every value, so changing "how dense" later is a one-line edit; it
costs nothing at runtime; and the old spacing is still there for anyone who prefers it.

## What changed

| | Compact (default) | Comfortable (the original) |
|---|---|---|
| Headline figure | 48px | 64px |
| Tile figure | 22px | 28px |
| Body / small body text | 13px / 12px | 14px / 13px |
| Card padding | 16px sides, 12px top and bottom | 20px all round |
| Gap between cards and tiles | 12px | 16px |
| Page margin (laptop and up) | 20px | 32px |
| Table column heads / rows | 28px / about 29px | 36px / about 41px |
| Charts | 70% height | full height |

On Breadth and Advance/Decline, compact puts the headline card full width with the four
tiles in one row beneath it; comfortable keeps the original layout (headline beside a
two-by-two). Colours, contrast, animation and wording are identical in both.

## Things that came up

- **The old 13px text had no line height of its own.** It borrowed one from its
  surroundings: 1.5× in cards (19.5px), a little less inside tables. The new small-text
  setting uses 1.5×, so comfortable matches the original everywhere except table rows,
  which are now about 1px taller.
- **The page's base text size stays the browser's 16px.** Making it the new body size
  looked natural, but every caption sized with a raw `text-[12px]` takes its line spacing
  from that base, so cards grew and shrank by a few pixels. Nothing visible uses the base
  size directly.
- **Three hand-built tables** (crash history on the Report Card, washout episodes on
  Signals, forward returns) used tighter cells than the rest. They now use the same row
  height as every other table: about 4px taller per row in comfortable, the same in
  compact.
- **Compact rows are 29px, not 28.** Table text sits on a 20px line; 4px above and below
  plus the 1px divider makes 29.
- **In compact, small body text and captions are both 12px.** Weight and colour still
  tell them apart.

## How to add something new

A new size or spacing that should follow density: add its `--density-*` variable to
**both** blocks in `src/app/globals.css`, add the `@theme` token that reads it, and for a
type size or a spacing register it in `src/lib/utils.ts` (otherwise `cn()` silently drops it, or keeps it beside a caller's override so the override never wins). Use the
token in components, never the pixel value. For a layout difference, use the `compact:` or
`comfortable:` variant. `tests/density.test.ts` fails if a raw 13px, a fixed card inset, a
fixed table row or a fixed chart height comes back.
