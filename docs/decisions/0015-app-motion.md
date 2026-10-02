# 0015 — App motion: a polished, smooth feel

**Date:** 2026-10-02 · **Status:** done ·
Spec: `docs/superpowers/specs/2026-10-02-app-motion-design.md` ·
Plan: `docs/superpowers/plans/2026-10-02-app-motion.md`

## Problem

The owner found the app flat: every page appeared at once and nothing moved. That was on
purpose, because the design system said "charts never animate; motion is colour and
opacity only". But a product people pay for should feel alive. The owner chose
**"Polished and smooth"**, like Zerodha Kite, Groww or Stripe: quick and never in the way.

## Options

| Option | Good | Bad |
|---|---|---|
| **A. Built-in tools** ✅ | Nothing heavy to install: React 19's `<ViewTransition>` (Next.js 16 supports it), Recharts' own animation, CSS, one small count-up helper | No springy physics |
| B. An animation library (Motion / Framer Motion) | Springs, fancy layout moves | A ~40 KB dependency; more code touched on every page |
| C. CSS only | Simplest | No count-up, no page cross-fades: only slightly better |

## Decision

Approach A, with four rules so motion never costs trust in a number:

1. **Motion only when something opens or changes, never while you read.** Hover is
   instant, and nothing loops.
2. **The final value is always the true one.** It is in the HTML from the first paint.
3. **"Reduce motion" on the reader's device turns everything off.**
4. **One clock:** 150 / 300 / 600 ms, shared by CSS and code (a test keeps them equal).

What moves:
- cards rise in, one after another;
- big figures count up (16%, −24, ₹476 cr, 0.9×…);
- the six charts draw in and morph when you change the date or range;
- every meter and bar grows, and traffic lights pop in;
- switches slide (averages, ranges, horizons, Screener tabs);
- popovers zoom open.

Page cross-fades and a loading skeleton were built, then removed after review (below).

Full table: the design system's "States and motion".

## Why

- It is the smallest change that makes the app feel alive. Nothing heavy is added, and the
  rules keep the numbers trustworthy.
- Every chart goes through one switch (`useChartAnimation`), every figure through one
  component (`CountUp`), and every duration through the tokens. A test forbids any chart
  from setting its own timing, so the app stays consistent as it grows.

## Problems met while building it

- **The popovers and date picker were meant to animate but never had.** The shadcn
  components use classes like `animate-in` and `zoom-in-95`, but the CSS package that
  defines them (`tw-animate-css`) was never installed, so the classes did nothing. It is
  installed now.
- **Counting up would have flickered on a full page load** ("16%" → "0%" → "16%"). The
  server sends the real number and JavaScript starts a moment later. The fix: the tiny
  script that already runs before the first paint (for the dark/light theme) now also marks
  the page when motion is allowed, and only then are figures hidden until they start
  counting. A CSS safety net shows them after 1.5 s no matter what. Without JavaScript,
  nothing is hidden.
- **The risk calculator's ₹ figures are not counted.** They change with every key typed in
  the amount box, and counting while you type would break rule 1.
- **On a phone, a chart can keep one more date label with motion on.** For example
  "Sep ’25" on the A/D line. The chart library thins axis labels slightly differently
  while its draw-in runs. The label doesn't overlap anything (69 px from the next), and no
  figure differs. Accepted.

## Checks

- **Tests (written first):**
  - The count-up maths reproduces every figure format exactly (Indian grouping, the true
    minus, ₹ / % / ×, ordinals) and never shows "−0".
  - The pre-paint script marks motion only when allowed.
  - The JavaScript timings equal the CSS tokens.
  - No chart hard-codes its animation.
  - Every meter has a grow class.
  - Every switch has its pill.
  - Suite: 316 pass.
- **Browser (headless Chrome, 1440 px and 390 px), on Breadth, A/D and the Report Card:**
  - Mid-motion screenshots show it working (the hero at "10" on its way to 16, the chart
    drawing in).
  - Once settled, the page text is **identical** to a load with motion turned off, at
    1440 px. At 390 px only chart axis labels differ, as above.
  - No sideways scrolling.
  - Stepping the date with ← never showed the loading skeleton, and the hero counted 16 →
    18 → 24, never from 0.
  - The pills sit under the selected option.
  - Popovers animate.
- **Numbers unchanged:** the independent audit (decision 0013) still finds 0 mismatches.

## Found by the independent review (fixed)

A fresh reviewer tested the branch in the browser, including with JavaScript off and on a
slow connection. The count-ups, charts, meters and pills held up. It found:

- **The loading skeleton hid pages from readers without JavaScript.** A root
  `loading.tsx` wraps every page, so the page arrived hidden behind the skeleton, and only
  JavaScript swapped it in. With JavaScript on, the skeleton's sidebar also flashed "No
  data loaded" on every navigation, which is false. **Removed.** A page now loads as it did
  before: the old page stays until the new one is ready.
- **Page cross-fades never ran.** React never started a view transition on any navigation,
  in development or in production, even from a client-side wrapper. My browser check had
  only confirmed that the URL changed, not that a fade happened. **Removed**, with its CSS;
  this decision no longer claims it. Try again when Next.js/React document it working for
  pages that render their own sidebar.
- **"Reduce motion" still delayed cards** by up to 0.6 s, one after another, because only
  durations were cut, not delays. Now delays are cut too, and every card and figure is
  visible from the first frame (0 of 58 hidden at 40 ms).
- **On slow phones the "16 → 0 → 16" flicker came back.** The safety net revealed the true
  figure, then JavaScript counted from 0. Now a figure already showing doesn't count.
- **Copying a number copied it twice** ("1616%"). Now only one copy can be selected.

Each was fixed with a test that failed first; suite 323 pass. In the browser, with
JavaScript off, the Report Card shows all 8 figures and no skeleton.

## Revisit when

- **Springs or shared-element morphs are wanted** (a stock row flying into its Report
  Card): approach B, or React's named `ViewTransition`s.
- **A new chart, meter or big figure is added:** spread `useChartAnimation()`, add a
  `grow-*` class, wrap the figure in `<CountUp>`.
