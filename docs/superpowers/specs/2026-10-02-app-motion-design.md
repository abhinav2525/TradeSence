# App motion: a polished, smooth feel — design

**Date:** 2026-10-02 · **Status:** awaiting owner review · **Path:** architectural

## Intent (agreed)

- **Why:** the owner finds the app flat: every page appears at once and nothing moves. A
  product people pay for should feel alive and modern.
- **Level:** "Polished and smooth", like Zerodha Kite, Groww or Stripe. Quick (under half
  a second), never in the way.
- **Approach (chosen: A):** built-in tools only. That means React 19's `<ViewTransition>`
  (supported natively by Next.js 16), Recharts' own animation, CSS, and one small
  count-up helper. The only package added is `tw-animate-css`, which is CSS only.
- **Constraint, data trust:** motion must never make a number harder to read or to trust.
  This replaces the design system's "charts never animate" rule with the rules below,
  recorded in decision 0015.

## Rules (the new "States and motion" section of the design system)

1. **Motion only when something opens or changes, never while you read.**
   - Hover, crosshairs and tooltips stay instant.
   - Nothing loops, pulses or moves on its own.
2. **The final value is always the true one.**
   - Animated numbers end exactly on the server-rendered value.
   - The exact value is in the HTML from the first paint, for screen readers and for no-JS
     use.
   - Nothing changes size while animating, so there is no layout shift.
3. **Reduce motion is respected everywhere.**
   - With `prefers-reduced-motion: reduce`, every animation is skipped: CSS (the existing
     global override in `globals.css`), Recharts, the count-up helper and view transitions.
4. **One clock.** Durations and easing are tokens in `globals.css`:
   - `--motion-fast` 150 ms (popovers, switches)
   - `--motion-base` 300 ms (entrances, changes)
   - `--motion-slow` 600 ms (first draw of charts, numbers and meters)
   - one ease-out curve

   JavaScript reads the same values from `src/lib/motion.ts`. No component hard-codes a
   duration.

## What moves

| Element | On page open | On a change (date, average, horizon, tab) | Hover / reading |
|---|---|---|---|
| Cards, tiles, sections | Fade in and rise 8 px, `base`, staggered 40 ms for the first 8; the rest appear with the 8th | No movement | Still |
| Big numbers (hero %, net advances, tile metrics, Report Card figures, calculator ₹) | Count up from 0, `slow` | Count from the old value to the new, `base` | Still |
| Charts: `BreadthArea`, `AdLineChart`, `McClellanBars`, `CrossingsBars`, `StockPriceChart`, `DrawdownChart` | Recharts draw-in, `slow`, ease-out | Recharts morph old → new, `base` | Instant (unchanged) |
| Meters and bars (`Readout` fill and range, `AdHero` split bar and diverging bars, `BreadthHero` histogram, `RiskCalculator` histogram, `VolumeTrack`, `MemberTable` and `CrossingsTable` bars) | Width or height grows from 0, `slow` | Slides to the new value, `base` | Still |
| Traffic lights (`LightDot`) | Fade and scale from 0.6, `base`, after their card | Colour cross-fade, `base` | Never pulse |
| Page navigation (sidebar, `b a c s r l` keys, links) | Main column cross-fades via `<ViewTransition>`, `fast`; sidebar persistent | | |
| Segmented switches (average 1/2/3, calculator horizons, Screener tabs, chart ranges 3M/6M/1Y/All) | | The highlight slides to the chosen option, `fast` | |
| Popovers, date picker | Zoom and fade, `fast` (fixes today's dead `animate-in` classes) | | |
| Loading | A `loading.tsx` per route: a skeleton of the page's cards with a soft shimmer (the shimmer stops once content arrives; it is the only repeating motion, and only while waiting) | | |

## Components (units)

- **`src/lib/motion.ts`**:
  - the duration and easing constants, mirrored from the CSS tokens;
  - `prefersReducedMotion()` (SSR-safe; false on the server);
  - `chartAnimation(kind: "enter" | "change")`, which returns the props every Recharts
    series spreads (`isAnimationActive`, `animationDuration`, `animationEasing`). It is the
    single switch for chart motion.
- **`src/lib/count.ts`**: pure maths, `countFrame(from, to, t)` with an ease-out curve and
  `t` clamped to [0, 1], and `formatLike(sample, value)`. The second keeps a number's
  formatting while it counts (decimals, true minus "−", Indian grouping, ₹ and % and ×
  affixes). Fully unit-tested.
- **`<CountUp value text>`** (client): the server HTML holds `text`, the
  server-formatted final string. With JavaScript and motion on, it counts from 0 on mount
  and from the previous value on change, then lands on exactly `text`. Its `aria-label`
  is always `text`. Values that aren't plain numbers (dates, "—") render unchanged.
  - **No flicker on a full page load.** Showing "16%" → "0%" → "16%" is avoided by the
    pre-paint inline script already in `layout.tsx` (the theme script). It sets
    `data-motion` on `<html>` when motion is allowed. Only then do count-up numbers start
    at opacity 0; `CountUp` makes them visible as it starts counting.
  - **A CSS failsafe** reveals them after 1.5 s if hydration never happens, so a number
    can never stay hidden. Without JavaScript the script never runs, and numbers show
    final.
- **`<Reveal index>`** (CSS class plus a wrapper): the staggered entrance, keyed by
  `index`. Pure CSS `@keyframes` using the tokens; no JavaScript timers.
- **Meters:** the `.grow-x` / `.grow-y` CSS classes. A `@keyframes` animation scales from
  0 (`transform-origin` at the start) and runs from the first paint, so there's no
  JavaScript and no flicker. The element's real `width` or `height` is the final value, so
  a browser that skips the animation shows it final. For changes, `transition` on `width`,
  `height` and `left`.
- **`<ViewTransition>`**: wraps the main content in `AppShell`. Default cross-fade only, no
  shared-element morphs in v1.
- **`tw-animate-css`**: imported in `globals.css` after `tailwindcss`, so the shadcn
  classes work.
- **Switch highlight:** an absolutely positioned pill behind the options, its `left` and
  `width` animated. It reuses the existing segmented-switch markup.

## Errors and edge cases

- **No JavaScript, or before hydration:** the final values and meters are in the server
  HTML. Count-up numbers are hidden only when the pre-paint script ran, and the 1.5 s CSS
  failsafe still reveals them, so nothing is ever blank or zero.
- **Very fast date stepping (← → held down):** each change restarts from the currently
  displayed value. Never from 0, and changes never queue up.
- **Back/forward navigation:** the cross-fade only; no re-count from 0 when the browser
  restores a page from its cache.
- **Browsers without View Transitions** (older Safari or Firefox): navigation is instant,
  as today.
- **Tables with hundreds of rows** (Crossings, the Screener's "near" list): only the first
  screenful of bars animates in. Rows below the fold appear already final, so scrolling
  isn't sluggish.

## Testing

- **Unit (`tests/motion.test.ts`):**
  - `countFrame` starts at `from`, ends exactly at `to` (t ≥ 1), is monotonic, and handles
    negatives (−24 counts through −12, not +12) and `from === to`.
  - `formatLike` keeps the formatting for `"16%"`, `"−58.8"`, `"−1,560"`, `"₹476 cr"`,
    `"0.9×"` and `"1,23,456"` (Indian grouping) at intermediate values.
  - `chartAnimation` returns `isAnimationActive: false` under reduced motion.
- **Guard test:** no file under `src/components` contains a literal `isAnimationActive=`
  or `animationDuration=`. Every chart goes through `chartAnimation`.
- **Browser (headless Chrome, 1440 px and 390 px), on Breadth, A/D and a Report Card:**
  - A screenshot about 150 ms after load shows motion in progress.
  - A screenshot after 1.5 s must have **text identical** to a reduced-motion load.
  - Reduced motion is emulated with `Emulation.setEmulatedMedia`, where the first frame
    is already final.
  - Popovers zoom open.
  - Stepping the date with ← → morphs and doesn't re-count from 0.
  - Navigating with `a` cross-fades.
- **Unchanged numbers:** `bun test` stays green, and `bun run audit:report-card` stays at 0
  mismatches. Motion is presentation only, and the audit proves no number moved.

## Out of scope (v1)

Shared-element morphs between pages, scroll-triggered animations, sound, animated
backgrounds, a replay or time-lapse feature, and springs or physics.

## Documentation

- `docs/design/system/README.md` "States and motion" is rewritten with the rules above,
  and "Charts never animate" is replaced.
- `docs/decisions/0015-app-motion.md`: the problem, options A/B/C, the decision, why, and
  the dead shadcn animation classes that were found and fixed.
- CLAUDE.md gotcha: durations come from motion tokens; charts use `chartAnimation`; animated
  numbers go through `<CountUp>`.
