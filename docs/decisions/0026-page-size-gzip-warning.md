# 0026 — "MaxListenersExceededWarning … drain listeners added to [Gzip]"

**Date:** 2026-10-04 · **Status:** done

## Problem

The owner saw this repeated in the terminal running the site (`bun run start`):

> MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 drain
> listeners added to [Gzip]. MaxListeners is 10.

## What we found

- **Where:** the production Next.js server (`next start`). Reproduced on a second copy of
  the server (port 3200) with a real headless browser: opening **Top volume** or a
  **Report Card**, or clicking between Top volume's tabs, printed 3 warnings each; every
  other page, and Top volume filtered to Micro caps, printed none. Plain `curl`, even a
  slowed one, didn't trigger it; the browser's streamed page-data requests did.
- **Not a memory leak.** 180 loads of Top volume: memory rose with warm-up, then held at
  about 390–450 MB under load and fell to **206 MB** once idle. A leak keeps climbing.
- **Cause:** page size. Next compresses each streamed response with gzip; a very large
  page queues many writes waiting for the compressor to drain, and Node warns at 11
  waiting listeners. They all clear a moment later.
  - Top volume was **2.6 MB**: all 747 rows, sent twice (as HTML and as page data), each
    row carrying ~11 class strings.
  - The RELIANCE Report Card was **448 KB**, of which ~125 KB were chart numbers carried to
    15 decimal places.

## Options

1. Turn off Next's compression (`compress: false`). Hides the warning, but sends every
   page uncompressed: slower on a phone over Wi-Fi.
2. Raise the listener limit. Hides a warning without changing anything real.
3. **Make the pages smaller.** Fixes the cause and makes both pages load faster.

## Decision

Option 3.

- **Top volume shows 100 rows per page**, with "Previous / Next 100" and ranks that keep
  counting (101, 102…). Every page is 235–422 KB (was 2.6 MB). A "Show all 747" link was
  tried first; it still produced 3 warnings (it is still the 2.6 MB page), so it was
  replaced with pages. Changing a filter returns to page 1; a page past the end shows the
  last one.
- **Report Card charts get rounded data** (`src/lib/chart-data.ts`: prices to paise,
  percentages to hundredths). The charts look the same; the report's own numbers, the
  risk calculator and the independent audit are untouched. RELIANCE: 448 → 367 KB.

Checked: the browser session that produced 15 warnings now produces none, including paging
through all 8 pages and the Report Card.

## Revisit when

- A new page lists hundreds of rows: page it, or the warning (and a slow page) comes back.
- The site moves behind a proxy that compresses: option 1 becomes reasonable.
