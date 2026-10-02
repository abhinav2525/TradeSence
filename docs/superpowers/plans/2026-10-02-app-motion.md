# App Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the app a polished, smooth feel — cards rise in, numbers count up, charts draw in, meters grow, switches slide, pages cross-fade, popovers zoom — without ever making a number harder to read or trust.

**Architecture:** One clock (CSS tokens mirrored in `src/lib/motion.ts`); pure count maths (`src/lib/count.ts`) behind a `<CountUp>` component that never flickers (a pre-paint script hides numbers only when JS + motion are on, with a CSS failsafe); Recharts' own animation through one hook; CSS keyframes for cards, meters and lights; a measuring `<SlidingPill>` for segmented switches; React 19 `<ViewTransition>` for page changes; a `loading.tsx` skeleton. Everything off under `prefers-reduced-motion`.

**Tech Stack:** Next.js 16 (App Router, React 19 canary with `ViewTransition`), Tailwind v4, shadcn, Recharts 2.15, Bun test, `tw-animate-css` (new, CSS-only).

**Spec:** `docs/superpowers/specs/2026-10-02-app-motion-design.md`

## Global Constraints

- Durations: `--motion-fast` **150ms**, `--motion-base` **300ms**, `--motion-slow` **600ms**; one ease-out curve `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`. JS reads `MOTION = { fast: 150, base: 300, slow: 600 }` from `src/lib/motion.ts`. No component hard-codes a duration.
- Motion only on open or change; hover, crosshair and tooltips stay instant; nothing loops (the loading shimmer runs only while waiting).
- The final value is the server-rendered text, always in the HTML from first paint; animation ends exactly on it.
- `prefers-reduced-motion: reduce` → no animation anywhere (CSS override already in `globals.css`, plus JS checks).
- Stagger: 40ms steps for the first 8 siblings; the rest share the 8th delay (280ms).
- Motion CSS is written **unlayered** at the end of `globals.css` (so it outranks Tailwind's layered utilities); the existing layered `!important` reduced-motion override still wins.
- No new `sql.raw`; no number changes: `bun test` and `bun run audit:report-card` must stay green / 0 mismatches.
- Tests run from the repo root (`bun test`). Before each commit: `git checkout -- next-env.d.ts`. Commit trailer: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01Ayzq2CX4q88qx2ZJ7f99JG`.

## Review Focus

1. **Stepping dates with ← → held down** (Breadth, A/D, Report Card): numbers must count from what is on screen, never restart from 0, never queue; the loading skeleton must not flash on a same-page date change. Pinned in Task 7 (browser: ← → three times shows no skeleton, and the hero figure never passes through 0); `CountUp` keeps the on-screen value in `onScreen` (Task 3) for exactly this.
2. **A number that is not a number** ("—", "12–80", "Not enough history", dates): renders unchanged, never "NaN" or "0". Pinned in Task 2 (`parseShown` returns null) and Task 3 (SSR render of "—").
3. **Reduced motion or no JavaScript**: the first paint is final — no hidden numbers, no zero-width meters. Pinned in Task 3 (pre-paint script sets nothing under reduced motion) and Task 7 (reduced-motion screenshot text equals the settled one).
4. **Phone width (390px)**: sliding pills, staggered cards and the skeleton cause no horizontal scroll or layout shift. Pinned in Task 7 (390px check).
5. **Long tables** (Crossings, Screener near list): only the first screenful of bars animates. Pinned in Task 5 (CSS rule + guard test).

---

### Task 1: The motion clock, shadcn's animation classes, and the chart switch

**Files:**
- Modify: `package.json` (add `tw-animate-css`), `src/app/globals.css`
- Create: `src/lib/motion.ts`, `src/types/react-view-transition.d.ts`
- Test: `tests/motion.test.ts`

**Interfaces:**
- Produces: `MOTION`, `EASE_OUT`, `prefersReducedMotion(): boolean`, `useReducedMotion(): boolean`, `type ChartAnimation = { isAnimationActive: boolean; animationDuration: number; animationEasing: "ease-out" }`, `chartAnimation(reduced: boolean, first: boolean): ChartAnimation`, `useChartAnimation(): ChartAnimation`; CSS vars `--motion-fast|base|slow`, `--ease-out`.

- [ ] **Step 1: Write the failing test** (`tests/motion.test.ts`)

```ts
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { MOTION, chartAnimation, prefersReducedMotion } from "../src/lib/motion";

const css = readFileSync("src/app/globals.css", "utf8");

describe("the motion clock", () => {
  test("JS durations mirror the CSS tokens exactly", () => {
    for (const k of ["fast", "base", "slow"] as const) {
      const m = new RegExp(`--motion-${k}:\\s*(\\d+)ms`).exec(css);
      expect(m && Number(m[1])).toBe(MOTION[k]);
    }
    expect(MOTION).toEqual({ fast: 150, base: 300, slow: 600 });
  });
  test("shadcn's animate-in/zoom classes exist: tw-animate-css is imported after tailwindcss", () => {
    expect(css.indexOf('@import "tw-animate-css"')).toBeGreaterThan(css.indexOf('@import "tailwindcss"'));
  });
  test("charts: slow on first draw, base on a change, off under reduced motion", () => {
    expect(chartAnimation(false, true)).toEqual({ isAnimationActive: true, animationDuration: 600, animationEasing: "ease-out" });
    expect(chartAnimation(false, false).animationDuration).toBe(300);
    expect(chartAnimation(true, true).isAnimationActive).toBe(false);
  });
  test("no window (server): not reduced", () => {
    expect(prefersReducedMotion()).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test tests/motion.test.ts`
Expected: FAIL — cannot find module `../src/lib/motion`.

- [ ] **Step 3: Install and import the shadcn animation CSS**

Run: `bun add tw-animate-css`
In `src/app/globals.css`, change the first line to two lines:

```css
@import "tailwindcss";
@import "tw-animate-css";
```

- [ ] **Step 4: Add the tokens** — append to the very end of `src/app/globals.css`:

```css
/*
 * Motion (decision 0015). One clock for the whole app; src/lib/motion.ts mirrors
 * it for JavaScript. Unlayered on purpose: it must outrank Tailwind's layered
 * utilities (e.g. transition-colors), while the layered !important
 * reduced-motion override above still wins over it.
 */
:root {
  --motion-fast: 150ms;
  --motion-base: 300ms;
  --motion-slow: 600ms;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
}
```

- [ ] **Step 5: Implement** `src/lib/motion.ts`

```ts
import { useEffect, useRef, useSyncExternalStore } from "react";

/** Milliseconds; mirrors --motion-* in globals.css (a test keeps them equal). */
export const MOTION = { fast: 150, base: 300, slow: 600 } as const;
export const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

const QUERY = "(prefers-reduced-motion: reduce)";

/** True when the reader asked their device for less motion. Always false on the server. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const m = window.matchMedia(QUERY);
  m.addEventListener("change", onChange);
  return () => m.removeEventListener("change", onChange);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}

export type ChartAnimation = { isAnimationActive: boolean; animationDuration: number; animationEasing: "ease-out" };

/** The props every Recharts series spreads: the one switch for chart motion. */
export function chartAnimation(reduced: boolean, first: boolean): ChartAnimation {
  return { isAnimationActive: !reduced, animationDuration: first ? MOTION.slow : MOTION.base, animationEasing: "ease-out" };
}

/** Slow draw-in on the first render, a quicker morph on every later data change. */
export function useChartAnimation(): ChartAnimation {
  const reduced = useReducedMotion();
  const first = useRef(true);
  useEffect(() => {
    first.current = false;
  }, []);
  return chartAnimation(reduced, first.current);
}
```

Create `src/types/react-view-transition.d.ts` (React's `ViewTransition` types live in the experimental entry; Task 6 imports it):

```ts
/// <reference types="react/experimental" />
```

- [ ] **Step 6: Run to verify it passes**

Run: `bun test tests/motion.test.ts && bunx tsc --noEmit`
Expected: PASS (4 tests), no type errors.

- [ ] **Step 7: Commit**

```bash
git checkout -- next-env.d.ts 2>/dev/null
git add package.json bun.lock src/app/globals.css src/lib/motion.ts src/types/react-view-transition.d.ts tests/motion.test.ts
git commit -m "Add the motion clock and shadcn's animation classes (popovers finally animate)"
```

(If the lockfile is named `bun.lockb`, add that instead.)

---

### Task 2: Count maths (pure)

**Files:**
- Create: `src/lib/count.ts`
- Test: `tests/count.test.ts`

**Interfaces:**
- Consumes: `ordinal` from `src/lib/format.ts`.
- Produces: `type Shown = { value: number; prefix: string; suffix: string; digits: number; signed: boolean; ordinal: boolean }`, `parseShown(text: string): Shown | null`, `formatLike(s: Shown, v: number): string`, `countFrame(from: number, to: number, t: number): number`.

- [ ] **Step 1: Write the failing tests** (`tests/count.test.ts`)

```ts
import { test, expect, describe } from "bun:test";
import { countFrame, formatLike, parseShown } from "../src/lib/count";

const SAMPLES = ["16", "−24", "+12", "0", "35.7", "−58.8", "−1,560", "2,300", "1,23,456", "₹476 cr", "0.9×", "+4.6%", "−36%", "81%", "92nd", "1st", "13th"];

describe("parseShown / formatLike", () => {
  test("every on-screen figure round-trips exactly", () => {
    for (const t of SAMPLES) {
      const s = parseShown(t);
      expect(s).not.toBeNull();
      expect(formatLike(s!, s!.value)).toBe(t);
    }
  });
  test("reads the value with its sign", () => {
    expect(parseShown("−1,560")!.value).toBe(-1560);
    expect(parseShown("+4.6%")!.value).toBe(4.6);
    expect(parseShown("₹476 cr")!.value).toBe(476);
  });
  test("intermediate frames keep the figure's shape", () => {
    expect(formatLike(parseShown("−1,560")!, -780.4)).toBe("−780");
    expect(formatLike(parseShown("₹476 cr")!, 1234.4)).toBe("₹1,234 cr");
    expect(formatLike(parseShown("+4.6%")!, 2.34)).toBe("+2.3%");
    expect(formatLike(parseShown("16")!, 7.6)).toBe("8");
    expect(formatLike(parseShown("92nd")!, 41.2)).toBe("41st");
    expect(formatLike(parseShown("16")!, -0.2)).toBe("0"); // never "−0"
  });
  test("anything that isn't a plain figure is left alone", () => {
    for (const t of ["—", "12–80", "1 Oct 2026", "", "Not enough history", "6 of 20"]) expect(parseShown(t)).toBeNull();
  });
});

describe("countFrame", () => {
  test("starts at from, ends exactly at to, and holds there", () => {
    expect(countFrame(0, 16, 0)).toBe(0);
    expect(countFrame(0, 16, 1)).toBe(16);
    expect(countFrame(0, 16, 7)).toBe(16);
    expect(countFrame(3, 9, -1)).toBe(3);
  });
  test("moves one way only (ease-out), negatives included", () => {
    let last = 0;
    for (let i = 1; i <= 20; i++) {
      const v = countFrame(0, -24, i / 20);
      expect(v).toBeLessThanOrEqual(last);
      expect(v).toBeGreaterThanOrEqual(-24);
      last = v;
    }
    expect(countFrame(0, 10, 0.5)).toBeGreaterThan(5); // ease-out: past halfway at half time
  });
  test("from === to stays put", () => {
    expect(countFrame(5, 5, 0.3)).toBe(5);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bun test tests/count.test.ts`
Expected: FAIL — cannot find module `../src/lib/count`.

- [ ] **Step 3: Implement** `src/lib/count.ts`

```ts
/**
 * The maths behind <CountUp>: read an on-screen figure ("−1,560", "₹476 cr",
 * "92nd"), and redraw any in-between value in exactly the same shape, so a
 * counting number never changes format and always ends on the true text.
 */
import { ordinal } from "./format";

export type Shown = { value: number; prefix: string; suffix: string; digits: number; signed: boolean; ordinal: boolean };

// optional ₹, optional true-minus/plus, digits with Indian or Western grouping, decimals, a known unit
const FIGURE = /^(₹?)([+−]?)(\d[\d,]*)(?:\.(\d+))?(%| cr|×|st|nd|rd|th)?$/;

export function parseShown(text: string): Shown | null {
  const m = FIGURE.exec(text);
  if (!m) return null;
  const [, prefix = "", sign = "", int = "", frac = "", suffix = ""] = m;
  const abs = Number(`${int.replace(/,/g, "")}${frac ? `.${frac}` : ""}`);
  if (!Number.isFinite(abs)) return null;
  return {
    value: sign === "−" ? -abs : abs,
    prefix, suffix, digits: frac.length, signed: sign !== "",
    ordinal: ["st", "nd", "rd", "th"].includes(suffix),
  };
}

export function formatLike(s: Shown, v: number): string {
  if (s.ordinal) return ordinal(Math.max(0, v));
  const rounded = Number(Math.abs(v).toFixed(s.digits));
  const body = rounded.toLocaleString("en-IN", { minimumFractionDigits: s.digits, maximumFractionDigits: s.digits });
  const sign = rounded === 0 ? "" : v < 0 ? "−" : s.signed ? "+" : "";
  return `${sign}${s.prefix}${body}${s.suffix}`;
}

/** Ease-out cubic from `from` to `to`; t is clamped to [0, 1] and t ≥ 1 returns `to` exactly. */
export function countFrame(from: number, to: number, t: number): number {
  if (t >= 1) return to;
  if (t <= 0) return from;
  const e = 1 - (1 - t) ** 3;
  return from + (to - from) * e;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `bun test tests/count.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git checkout -- next-env.d.ts 2>/dev/null
git add src/lib/count.ts tests/count.test.ts
git commit -m "Add count-up maths that keeps every figure's format"
```

---

### Task 3: `<CountUp>` without flicker, on every big number

**Files:**
- Create: `src/components/CountUp.tsx`, `src/lib/prepaint.ts`
- Modify: `src/app/layout.tsx`, `src/app/globals.css`, `src/components/BreadthHero.tsx`, `src/components/AdHero.tsx`, `src/components/Readout.tsx`, `src/components/StockChecks.tsx`
- Test: `tests/countup.test.ts`

**Interfaces:**
- Consumes: Task 1 `MOTION`, `prefersReducedMotion`; Task 2 `parseShown`, `formatLike`, `countFrame`.
- Produces: `CountUp({ text: string; className?: string })` (default export); `PREPAINT_SCRIPT: string`.

- [ ] **Step 1: Write the failing tests** (`tests/countup.test.ts`)

```ts
import { test, expect, describe } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import CountUp from "../src/components/CountUp";
import { PREPAINT_SCRIPT } from "../src/lib/prepaint";

describe("CountUp on the server", () => {
  test("the HTML already holds the final figure, for screen readers and no-JS", () => {
    const html = renderToString(createElement(CountUp, { text: "−1,560" }));
    expect(html).toContain("countup");
    expect(html.match(/−1,560/g)!.length).toBe(2); // the sr-only copy and the visible one
  });
  test("a non-figure renders unchanged", () => {
    expect(renderToString(createElement(CountUp, { text: "—" }))).toContain("—");
  });
});

describe("the pre-paint script", () => {
  const run = (reduced: boolean, theme: string | null) => {
    const attrs: Record<string, string> = {};
    const classes = new Set(["dark"]);
    const document = { documentElement: { classList: { remove: (c: string) => classes.delete(c) }, setAttribute: (k: string, v: string) => { attrs[k] = v; } } };
    const window = { matchMedia: (q: string) => ({ matches: reduced && q.includes("reduce") }) };
    const localStorage = { getItem: () => theme };
    new Function("document", "window", "localStorage", PREPAINT_SCRIPT)(document, window, localStorage);
    return { attrs, classes };
  };
  test("marks the page for motion only when motion is allowed", () => {
    expect(run(false, null).attrs).toHaveProperty("data-motion");
    expect(run(true, null).attrs).not.toHaveProperty("data-motion");
  });
  test("still applies the stored light theme", () => {
    expect(run(false, "light").classes.has("dark")).toBe(false);
    expect(run(false, null).classes.has("dark")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bun test tests/countup.test.ts`
Expected: FAIL — cannot find module `../src/components/CountUp`.

- [ ] **Step 3: The pre-paint script** — create `src/lib/prepaint.ts`:

```ts
/*
 * Runs in <head> while the HTML is still parsing, before the first paint:
 * 1. a stored "light" theme is applied, so a light-mode reader never sees a dark flash;
 * 2. `data-motion` marks the page when the reader allows motion. Only then do
 *    count-up numbers start hidden (globals.css), so a full page load never shows
 *    "16%" → "0%" → "16%". Without this script (no JS) nothing is hidden.
 */
export const PREPAINT_SCRIPT = `(function(){var d=document.documentElement;try{if(localStorage.getItem("theme")==="light")d.classList.remove("dark")}catch(e){}try{if(!window.matchMedia("(prefers-reduced-motion: reduce)").matches)d.setAttribute("data-motion","")}catch(e){}})()`;
```

In `src/app/layout.tsx`: delete the `THEME_SCRIPT` constant and the comment block above it; add `import { PREPAINT_SCRIPT } from "@/lib/prepaint";` after the `./globals.css` import; replace `__html: THEME_SCRIPT` with `__html: PREPAINT_SCRIPT`. Add above the `RootLayout` function:

```ts
/*
 * Dark is the default and is what the server renders. PREPAINT_SCRIPT applies a
 * stored light theme and marks motion before the first paint;
 * suppressHydrationWarning on <html> lets React accept what it changed.
 */
```

- [ ] **Step 4: The component** — create `src/components/CountUp.tsx`:

```tsx
"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { countFrame, formatLike, parseShown } from "@/lib/count";
import { MOTION, prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * A figure that counts to its value: from 0 when it first appears, from what is
 * on screen when it changes. The server HTML is always the final text; screen
 * readers get it from the sr-only copy. Values that aren't plain figures ("—",
 * "12–80") render unchanged.
 */
export default function CountUp({ text, className }: { text: string; className?: string }) {
  const [shown, setShown] = useState(text);
  const box = useRef<HTMLSpanElement>(null);
  const onScreen = useRef<number | null>(null); // the value currently drawn, once counting has begun

  // layout effect: the first frame is set before the browser paints, so nothing flickers
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const target = parseShown(text);
    if (!target || prefersReducedMotion()) {
      onScreen.current = target?.value ?? null;
      setShown(text);
      el.dataset.counted = "";
      return;
    }
    const from = onScreen.current ?? 0;
    const duration = onScreen.current === null ? MOTION.slow : MOTION.base;
    setShown(formatLike(target, from));
    el.dataset.counted = "";
    const start = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const t = (now - start) / duration;
      const v = countFrame(from, target.value, t);
      onScreen.current = v;
      if (t >= 1) {
        setShown(text);
        return;
      }
      setShown(formatLike(target, v));
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [text]);

  return (
    <span ref={box} className={cn("countup", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{shown}</span>
    </span>
  );
}
```

Append to the end of `src/app/globals.css`:

```css
/* Count-up figures start hidden only when the pre-paint script marked motion;
   CountUp reveals them as it starts counting. Failsafe: shown after 1.5s anyway. */
html[data-motion] .countup:not([data-counted]) > [aria-hidden] {
  opacity: 0;
  animation: countup-failsafe 0s 1.5s forwards;
}
@keyframes countup-failsafe { to { opacity: 1; } }
```

- [ ] **Step 5: Run to verify they pass**

Run: `bun test tests/countup.test.ts && bunx tsc --noEmit`
Expected: PASS (4 tests).

- [ ] **Step 6: Use it on the big numbers** (each a single exact replacement; add `import CountUp from "@/components/CountUp";` to each file's imports)

- `src/components/BreadthHero.tsx`: replace `          {pct.toFixed(0)}\n          <span className="ml-1 text-[0.45em]` with `          <CountUp text={pct.toFixed(0)} />\n          <span className="ml-1 text-[0.45em]`.
- `src/components/AdHero.tsx`: replace `<p className="mt-4 text-display tabular-nums text-foreground">{signed(net)}</p>` with `<p className="mt-4 text-display tabular-nums text-foreground"><CountUp text={signed(net)} /></p>`.
- `src/components/Readout.tsx`: replace `<span className="text-metric">{value}</span>` with `<CountUp className="text-metric" text={value} />`.
- `src/components/StockChecks.tsx`: replace `<p className="mt-3 text-metric tabular-nums text-foreground">{c.figure}</p>` with `<p className="mt-3 text-metric tabular-nums text-foreground"><CountUp text={c.figure} /></p>`.

The risk calculator's ₹ figures are **not** wrapped: they change on every keystroke in the amount box, and counting while someone types breaks rule 1 ("never while you read").

- [ ] **Step 7: Verify**

Run: `bunx tsc --noEmit && bun test`
Expected: all pass (the Report Card test that reads `checksOf(...).sentence` is unaffected; figures are unchanged strings).

- [ ] **Step 8: Commit**

```bash
git checkout -- next-env.d.ts 2>/dev/null
git add src tests
git commit -m "Count big numbers up, with no flicker and the true value always in the HTML"
```

---

### Task 4: Charts draw in, and morph on change

**Files:**
- Modify: `src/components/BreadthArea.tsx`, `AdLineChart.tsx`, `McClellanBars.tsx`, `CrossingsBars.tsx`, `StockPriceChart.tsx`, `DrawdownChart.tsx`
- Test: `tests/motion.test.ts` (append the guard)

**Interfaces:**
- Consumes: Task 1 `useChartAnimation()`.

- [ ] **Step 1: Write the failing guard test** (append to `tests/motion.test.ts`)

```ts
import { readdirSync } from "node:fs";

test("every chart takes its motion from useChartAnimation, none hard-codes it", () => {
  const dir = "src/components";
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".tsx"))) {
    const src = readFileSync(`${dir}/${f}`, "utf8");
    expect({ f, literal: /isAnimationActive=\{|animationDuration=\{/.test(src) }).toEqual({ f, literal: false });
  }
  for (const f of ["BreadthArea", "AdLineChart", "McClellanBars", "CrossingsBars", "StockPriceChart", "DrawdownChart"]) {
    expect(readFileSync(`${dir}/${f}.tsx`, "utf8")).toContain("useChartAnimation()");
  }
});
```

Run: `bun test tests/motion.test.ts` — Expected: FAIL (7 literal `isAnimationActive={false}`).

- [ ] **Step 2: Implement** — in each of the six files:
  1. add `import { useChartAnimation } from "@/lib/motion";` to the imports;
  2. on the first line inside the component (immediately after the line `export default function <Name>(…) {`), add `  const anim = useChartAnimation();`;
  3. replace every `isAnimationActive={false}` with `{...anim}` (StockPriceChart has two).

- [ ] **Step 3: Verify**

Run: `bun test tests/motion.test.ts && bunx tsc --noEmit && bun test`
Expected: PASS; full suite green.

- [ ] **Step 4: Commit**

```bash
git checkout -- next-env.d.ts 2>/dev/null
git add src/components tests/motion.test.ts
git commit -m "Charts draw in once and morph on change, through one shared switch"
```

---

### Task 5: Cards rise in, meters grow, lights appear

**Files:**
- Modify: `src/app/globals.css`, `src/components/ui/card.tsx`, `Readout.tsx`, `BreadthHero.tsx`, `AdHero.tsx`, `MemberTable.tsx`, `CrossingsTable.tsx`, `VolumeTrack.tsx`, `RiskCalculator.tsx`, `LightDot.tsx`
- Test: `tests/motion.test.ts` (append)

**Interfaces:**
- Produces CSS classes: `reveal`, `grow-x`, `grow-x-end`, `grow-y`, `grow-y-top`, `fade-in`, `pop-in`.

- [ ] **Step 1: Write the failing guard test** (append to `tests/motion.test.ts`)

```ts
test("every meter bar grows in, and every card rises in", () => {
  const files = ["Readout", "BreadthHero", "AdHero", "MemberTable", "CrossingsTable", "VolumeTrack", "RiskCalculator"];
  for (const f of files) {
    const src = readFileSync(`src/components/${f}.tsx`, "utf8");
    const bars = (src.match(/style=\{\{ (width|height|left):/g) ?? []).length;
    const grows = (src.match(/\b(grow-x|grow-x-end|grow-y|grow-y-top|fade-in)\b/g) ?? []).length;
    expect({ f, ok: grows >= bars }).toEqual({ f, ok: true });
  }
  expect(readFileSync("src/components/ui/card.tsx", "utf8")).toContain("reveal");
  expect(readFileSync("src/components/LightDot.tsx", "utf8")).toContain("pop-in");
  for (const k of ["reveal", "grow-x", "grow-y", "pop-in"]) expect(css).toContain(`@keyframes ${k}`);
  expect(css).toContain("tr:nth-child(n+16)"); // long tables: only the first screenful animates
});
```

Run: `bun test tests/motion.test.ts` — Expected: FAIL.

- [ ] **Step 2: The CSS** — append to the end of `src/app/globals.css`:

```css
/* Cards and tiles rise in on open, staggered 40ms for the first 8 siblings. */
@keyframes reveal { from { opacity: 0; transform: translateY(8px); } }
.reveal { animation: reveal var(--motion-base) var(--ease-out) backwards; }
.reveal:nth-child(2) { animation-delay: 40ms; }
.reveal:nth-child(3) { animation-delay: 80ms; }
.reveal:nth-child(4) { animation-delay: 120ms; }
.reveal:nth-child(5) { animation-delay: 160ms; }
.reveal:nth-child(6) { animation-delay: 200ms; }
.reveal:nth-child(7) { animation-delay: 240ms; }
.reveal:nth-child(n+8) { animation-delay: 280ms; }

/* Meters grow from zero on open (no JS, so no flicker; the real width is the
   final value) and slide to a new value on change. */
@keyframes grow-x { from { transform: scaleX(0); } }
@keyframes grow-y { from { transform: scaleY(0); } }
.grow-x, .grow-x-end, .grow-y, .grow-y-top {
  animation: var(--motion-slow) var(--ease-out) backwards;
  transition-property: width, height, left, background-color;
  transition-duration: var(--motion-base);
  transition-timing-function: var(--ease-out);
}
.grow-x { animation-name: grow-x; transform-origin: left center; }
.grow-x-end { animation-name: grow-x; transform-origin: right center; }
.grow-y { animation-name: grow-y; transform-origin: center bottom; }
.grow-y-top { animation-name: grow-y; transform-origin: center top; }
/* long tables: only the first screenful animates, so scrolling never lags */
tr:nth-child(n+16) .grow-x, tr:nth-child(n+16) .grow-x-end { animation: none; }

/* Markers that sit on a meter fade in and slide; traffic lights pop in after their card. */
@keyframes fade-in { from { opacity: 0; } }
.fade-in {
  animation: fade-in var(--motion-slow) var(--ease-out) backwards;
  transition: left var(--motion-base) var(--ease-out);
}
@keyframes pop-in { from { opacity: 0; transform: scale(0.6); } }
.pop-in {
  animation: pop-in var(--motion-base) var(--ease-out) 150ms backwards;
  transition: background-color var(--motion-base) var(--ease-out);
}
```

- [ ] **Step 3: The classes** (exact replacements)

- `src/components/ui/card.tsx`: `"rounded-lg border bg-card text-card-foreground shadow-card",` → `"reveal rounded-lg border bg-card text-card-foreground shadow-card",`
- `src/components/Readout.tsx`:
  - `"flex min-w-0 flex-col rounded-lg border bg-card p-4 shadow-card"` → `"reveal flex min-w-0 flex-col rounded-lg border bg-card p-4 shadow-card"`
  - `className={cn("h-full rounded-full", toneBg[fillTone])}` → `className={cn("grow-x h-full rounded-full", toneBg[fillTone])}`
  - `className="absolute inset-y-0 rounded-full bg-brand/45"` → `className="grow-x absolute inset-y-0 rounded-full bg-brand/45"`
  - `className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ring-2 ring-card"` → `className="fade-in absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ring-2 ring-card"`
- `src/components/BreadthHero.tsx`:
  - `<div className="h-full rounded-l-full bg-up" style=` → `<div className="grow-x h-full rounded-l-full bg-up" style=`
  - `"w-full rounded-t-[3px] transition-colors",` → `"grow-y w-full rounded-t-[3px] transition-colors",`
- `src/components/AdHero.tsx`:
  - `<div className="h-full bg-up" style=` → `<div className="grow-x h-full bg-up" style=`
  - `<div className="h-full bg-chart-muted" style=` → `<div className="grow-x h-full bg-chart-muted" style=`
  - `<div className="w-full rounded-t-[3px] bg-up" style=` → `<div className="grow-y w-full rounded-t-[3px] bg-up" style=`
  - `<div className="w-full rounded-b-[3px] bg-down" style=` → `<div className="grow-y-top w-full rounded-b-[3px] bg-down" style=`
- `src/components/MemberTable.tsx`: `className={cn("h-full rounded-full", tone === "up" ? "bg-up" : "bg-down")}` → `className={cn("grow-x-end h-full rounded-full", tone === "up" ? "bg-up" : "bg-down")}` (the track is `justify-end`, so it grows from the right)
- `src/components/CrossingsTable.tsx`: `<span className="h-full rounded-full bg-brand" style=` → `<span className="grow-x h-full rounded-full bg-brand" style=`
- `src/components/VolumeTrack.tsx`: `className="absolute inset-y-0 left-0 rounded-full bg-brand"` → `className="grow-x absolute inset-y-0 left-0 rounded-full bg-brand"`
- `src/components/RiskCalculator.tsx`: `"w-full rounded-t-[3px]",` → `"grow-y w-full rounded-t-[3px]",`
- `src/components/LightDot.tsx`: `"size-2.5 rounded-full",` → `"pop-in size-2.5 rounded-full",`

- [ ] **Step 4: Verify**

Run: `bun test tests/motion.test.ts && bunx tsc --noEmit && bun test`
Expected: PASS; full suite green.

- [ ] **Step 5: Commit**

```bash
git checkout -- next-env.d.ts 2>/dev/null
git add src tests
git commit -m "Cards rise in, meters grow from zero, traffic lights pop in"
```

---

### Task 6: Sliding switches, page cross-fades, and a loading skeleton

**Files:**
- Create: `src/components/SlidingPill.tsx`, `src/app/loading.tsx`
- Modify: `src/app/globals.css`, `src/components/AppShell.tsx`, `src/components/SiteNav.tsx`, `src/components/MaTabs.tsx`, `src/components/BreadthArea.tsx`, `src/components/AdLineChart.tsx`, `src/components/RiskCalculator.tsx`, `src/app/screener/page.tsx`
- Test: `tests/motion.test.ts` (append)

**Interfaces:**
- Consumes: CSS tokens (Task 1).
- Produces: `SlidingPill({ active: string })`; CSS classes `seg`, `seg-pill`, `skeleton`; view-transition classes `page-in`, `page-out`. `SiteNav`'s `current` becomes `Section | null`.

- [ ] **Step 1: Write the failing guard test** (append to `tests/motion.test.ts`)

```ts
test("every segmented switch has a sliding pill; pages cross-fade; a loading skeleton exists", () => {
  const files = ["src/components/MaTabs.tsx", "src/components/BreadthArea.tsx", "src/components/AdLineChart.tsx", "src/components/RiskCalculator.tsx", "src/app/screener/page.tsx"];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const groups = (src.match(/rounded-md border bg-raised p-0\.5/g) ?? []).length;
    const pills = (src.match(/<SlidingPill /g) ?? []).length;
    expect({ f, groups, pills, seg: (src.match(/\bseg relative\b/g) ?? []).length }).toEqual({ f, groups, pills: groups, seg: groups });
  }
  const shell = readFileSync("src/components/AppShell.tsx", "utf8");
  expect(shell).toContain("<ViewTransition");
  expect(css).toContain("::view-transition-new(.page-in)");
  expect(readFileSync("src/app/loading.tsx", "utf8")).toContain("skeleton");
});
```

Run: `bun test tests/motion.test.ts` — Expected: FAIL.

- [ ] **Step 2: The pill** — create `src/components/SlidingPill.tsx`:

```tsx
"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * The raised thumb of a segmented control, sliding to the selected option
 * (aria-pressed or aria-selected). It measures the selected option, so labels of
 * any width work. Without JavaScript the selected option keeps its own thumb:
 * the group only drops it once `data-pill` is set.
 */
export default function SlidingPill({ active }: { active: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const group = ref.current?.parentElement;
    if (!group) return;
    const measure = () => {
      const sel = group.querySelector<HTMLElement>('[aria-pressed="true"],[aria-selected="true"]');
      setBox(sel ? { left: sel.offsetLeft, width: sel.offsetWidth } : null);
    };
    measure();
    group.dataset.pill = "";
    const ro = new ResizeObserver(measure);
    ro.observe(group);
    return () => ro.disconnect();
  }, [active]);

  return <span ref={ref} aria-hidden="true" className={box ? "seg-pill" : "hidden"} style={box ?? undefined} />;
}
```

- [ ] **Step 3: Use it in every switch.** Each container's class string is exactly `"inline-flex items-center gap-0.5 rounded-md border bg-raised p-0.5"`: in each, prepend `seg relative ` to that string and insert `<SlidingPill active={…} />` as the container's first child; add `import SlidingPill from "@/components/SlidingPill";`.
  - `MaTabs.tsx`: `active={ma}`
  - `BreadthArea.tsx`, `AdLineChart.tsx`: `active={range}`
  - `RiskCalculator.tsx`: `active={h}`
  - `src/app/screener/page.tsx`: the Signal tabs `active={view}`, the Volume group `active={vol}`

- [ ] **Step 4: Page cross-fades and the skeleton.**

`src/components/AppShell.tsx`: add `import { ViewTransition } from "react";` and wrap the inner content `div` (not `SiteNav`) so `<main>` reads:

```tsx
      <main className="lg:pl-60">
        {/* a new page fades in; the sidebar (outside) stays put; same-page updates (date, average) don't cross-fade */}
        <ViewTransition enter="page-in" exit="page-out" update="none" default="none">
          <div className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8">
            {children}
          </div>
        </ViewTransition>
      </main>
```

`src/components/SiteNav.tsx`: change `type Props = { current: Section; ma: string; asOf?: string | null };` to `type Props = { current: Section | null; ma: string; asOf?: string | null };` (null = nothing highlighted, used while loading).

Create `src/app/loading.tsx`:

```tsx
import SiteNav from "@/components/SiteNav";

/** While a page's server queries run: the page's shape, softly shimmering, so navigation never looks frozen. */
export default function Loading() {
  return (
    <>
      <SiteNav current={null} ma="sma200" />
      <main className="lg:pl-60" aria-busy="true" aria-label="Loading">
        <div className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          <div className="skeleton h-3 w-40 rounded" />
          <div className="skeleton mt-3 h-8 w-72 max-w-full rounded" />
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-28 rounded-lg" />)}
          </div>
          <div className="skeleton mt-4 h-72 rounded-lg" />
        </div>
      </main>
    </>
  );
}
```

Append to the end of `src/app/globals.css`:

```css
/* Segmented switches: one raised pill slides to the selected option. */
.seg-pill {
  position: absolute;
  top: 2px;
  bottom: 2px;
  border-radius: 8px;
  background: var(--thumb);
  box-shadow: var(--elev-thumb);
  transition: left var(--motion-fast) var(--ease-out), width var(--motion-fast) var(--ease-out);
}
.seg > a, .seg > button { position: relative; z-index: 1; }
.seg[data-pill] > [aria-pressed="true"], .seg[data-pill] > [aria-selected="true"] { background: transparent; box-shadow: none; }

/* Page changes: the new page fades in; the old one fades out quickly. The root
   snapshot (sidebar included) doesn't animate, and clicks pass through. */
::view-transition { pointer-events: none; }
::view-transition-old(root), ::view-transition-new(root) { animation: none; }
@keyframes vt-out { to { opacity: 0; } }
@keyframes vt-in { from { opacity: 0; transform: translateY(6px); } }
::view-transition-old(.page-out) { animation: var(--motion-fast) var(--ease-out) both vt-out; }
::view-transition-new(.page-in) { animation: var(--motion-base) var(--ease-out) both vt-in; }
@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(*), ::view-transition-new(*), ::view-transition-group(*) {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
  }
}

/* Loading skeleton: the only repeating motion, and only while waiting. */
@keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.skeleton {
  background: linear-gradient(90deg, var(--raised) 25%, var(--border) 50%, var(--raised) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
}
```

(If `--raised` or `--border` is not a defined variable in `globals.css`, use the variables that back the `bg-raised` and `border` utilities — check the `@theme inline` block — and ledger the substitution.)

- [ ] **Step 5: Verify**

Run: `bun test tests/motion.test.ts && bunx tsc --noEmit && bun test`
Expected: PASS; full suite green. If `tsc` reports `ViewTransition` missing from `react`, confirm `src/types/react-view-transition.d.ts` (Task 1) is included by `tsconfig.json`'s `include` globs.

- [ ] **Step 6: Commit**

```bash
git checkout -- next-env.d.ts 2>/dev/null
git add src tests
git commit -m "Sliding switches, page cross-fades and a loading skeleton"
```

---

### Task 7: Prove it in the browser, then document

**Files:**
- Create: `docs/decisions/0015-app-motion.md`
- Modify: `docs/design/system/README.md`, `docs/design/HANDOFF.md`, `docs/decisions/README.md`, `CLAUDE.md`, `TODO.md`

- [ ] **Step 1: Browser check.** Start `bun run dev -- -p 3001` in the background. With headless Chrome over CDP (a scratch script in the plan workspace; `Input.dispatchKeyEvent` for Enter needs `text: "\r"`; arrow keys use `rawKeyDown`):
  - For `/`, `/advance-decline`, `/stock/KOTAKBANK` at 1440px and 390px:
    - screenshot ~150ms after `Page.navigate` load → motion visibly in progress (cards partly faded, numbers mid-count);
    - read `document.querySelector('main').innerText` after 1.5s (A);
    - reload with `Emulation.setEmulatedMedia({ features: [{ name: "prefers-reduced-motion", value: "reduce" }] })`, read innerText immediately after load (B). **A must equal B exactly.**
    - `document.scrollingElement.scrollWidth <= innerWidth` (no horizontal scroll).
  - On `/`: press `ArrowLeft` three times quickly; screenshot every 100ms: no skeleton appears (`document.querySelector('[aria-busy="true"]')` stays null), the hero number never shows "0" mid-way (it counts between the two sessions' values).
  - Press `a`: the page cross-fades to Advance/Decline (`::view-transition` runs; final URL `/advance-decline`).
  - Click a 1/2/3 average tab and a 3M/6M/1Y range button: the `.seg-pill` element's `left` changes and it sits under the selected option.
  - Open an ⓘ popover: its `data-state="open"` content has a non-`none` computed `animation-name` (tw-animate-css works).
  - Look at the saved screenshots.
- [ ] **Step 2: Numbers unchanged.** Run `bun test` and `bun run audit:report-card` → all pass, 0 mismatches.
- [ ] **Step 3: Docs.**
  - `docs/design/system/README.md`: replace "Charts never animate." with "Charts draw in once on open and morph on change; hover is instant (see States and motion)." Rewrite the "States and motion" section with the spec's four rules and the "What moves" table, the tokens, and the `CountUp` / `useChartAnimation` / `grow-*` / `reveal` / `SlidingPill` vocabulary.
  - `docs/design/HANDOFF.md`: change "Charts: no animation" to "Charts: draw-in on open and a quick morph on change, never on hover".
  - `docs/decisions/0015-app-motion.md` (decision-log format, plain language): Problem (the app felt flat; the owner asked for animation), Options A/B/C, Decision (approach A, "Polished and smooth", the four rules), Why, Problems met (the dead shadcn `animate-in` classes; the count-up flicker and the pre-paint fix; the calculator's ₹ figures deliberately not counted; every ledger ruling), Checks (tests, browser A = B text equality, audit 0 mismatches), Revisit when (springs or shared-element morphs wanted; a new chart or meter: use `useChartAnimation` / `grow-*`).
  - `docs/decisions/README.md`: a row for 0015.
  - `CLAUDE.md` "Gotchas": **Motion goes through the tokens.** Durations come from `--motion-*` / `MOTION`; charts spread `useChartAnimation()` (a test forbids literal `isAnimationActive`); big figures go through `<CountUp>`; meters get a `grow-*` class; never animate on hover or while typing (decision 0015).
  - `TODO.md` Done: "App motion: 0015".
- [ ] **Step 4: Commit**

```bash
git checkout -- next-env.d.ts 2>/dev/null
git add docs CLAUDE.md TODO.md
git commit -m "Document app motion (decision 0015)"
```
