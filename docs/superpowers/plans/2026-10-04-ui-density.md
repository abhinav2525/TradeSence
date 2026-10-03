# UI Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every page denser by default (`compact`), with a remembered switch back to today's spacing (`comfortable`), driven by one `data-density` attribute on `<html>`.

**Architecture:** Each value the switch controls is a `--density-*` CSS variable, set once per density in `globals.css`. Tailwind tokens (`text-body-sm`, `px-card-x`, `gap-cards`, `h-row-head`, `py-cell`, `lg:px-gutter`) point at those variables, so components name the role, not the pixels. Layout differences (the hero row) use `compact:` / `comfortable:` custom variants. The attribute is server-rendered as `compact`, overwritten before first paint from `localStorage.density`, and flipped by a sidebar button or the `d` key, exactly like the theme.

**Tech Stack:** Next.js 16, Tailwind v4 (`@theme`, `@custom-variant`), tailwind-merge, Recharts `ChartContainer`, Bun test.

**Spec:** `docs/superpowers/specs/2026-10-04-ui-density-design.md`

## Global Constraints

- Compact values: display **48px/1**, metric **22px/28px**, body **13px/20px**, body-sm **12px/18px**; card side inset **16px**, card body vertical **12px**, card header top **16px** (unchanged `pt-4`); gap between cards/tiles **12px**; gutter from `lg` **20px**; table header **28px**; table cell vertical padding **5px** (12px text on an 18px line → 28px row); charts **×0.7**.
- Comfortable values = today: display 64/1, metric 28/32, body 14/20, body-sm 13/20, side inset 20, body vertical 20, gaps 16, gutter 32, table header 36 (`h-9`), cell vertical 10 (`py-2.5`), charts ×1.
- Default is `compact`, everywhere: server HTML, no stored value, unreadable storage, or an unknown stored value.
- Colours, contrast, motion durations and copy are unchanged. No literal `isAnimationActive`; no new `<SlidingPill>`. Do not touch `ui/button.tsx` sizes or the sidebar's own spacing.
- No raw `text-[13px]`, `text-sm`, or `h-[Npx]` chart height may remain for anything the switch controls.
- A type size added to `@theme` is added to the `font-size` group in `src/lib/utils.ts` in the same step.
- Tests run from the repo root (`bun test`). Before each commit: `git checkout -- next-env.d.ts 2>/dev/null; true`. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **First paint with `comfortable` stored**: the page must not draw compact then jump. Pinned in Task 2 (prepaint sets the attribute) and Task 6 (reload with `comfortable` stored, screenshot before hydration matches settled).
2. **Storage blocked or holding junk** (`"wide"`, `"null"`): the page stays compact and nothing throws. Pinned in Task 2 (prepaint tests for both).
3. **`cn()` merging the new sizes**: `cn("text-body-sm", "text-foreground")` must keep both, and `cn("text-body-sm", "text-[12px]")` must keep only the last. Pinned in Task 1.
4. **Typing `d` in the date field or the risk calculator**: must type a "d", not flip density. Pinned in Task 2 (the key goes through `Hotkeys`' existing input guard; browser check in Task 6).
5. **Breadth and A/D between `lg` and `xl`, and at 390px**: four tiles in one row must not overflow or truncate figures; the hero must not get a dead right half. Pinned in Task 5 (browser check at 1024, 1280, 1440 and 390 widths).

## File Structure

| File | Change |
|---|---|
| `src/app/globals.css` | `--density-*` variables per density; new/changed `@theme` tokens; `compact`/`comfortable` variants; `<body>` uses `text-body` |
| `src/lib/utils.ts` | register `body`, `body-sm` with tailwind-merge |
| `src/lib/prepaint.ts` | read `localStorage.density` |
| `src/components/DensityToggle.tsx` (new) | `toggleDensity()` + the button |
| `src/components/Hotkeys.tsx`, `SiteNav.tsx` | `d` key; button under the theme toggle and in the mobile bar |
| `src/app/layout.tsx` | `data-density="compact"` on `<html>` |
| ~29 components and pages | `text-[13px]` → `text-body-sm`, `text-sm` → `text-body` |
| `ui/card.tsx`, `ui/table.tsx`, `AppShell.tsx`, card-padding users, table components | padding, row and gutter tokens |
| 7 chart components | scaled heights |
| `src/app/page.tsx`, `src/app/advance-decline/page.tsx`, `Readout.tsx`, page grids | hero row, `gap-cards` |
| `tests/density.test.ts` (new) | every guard below |
| docs | design-system README, decision 0020, CLAUDE.md, `src/lib/CLAUDE.md`, `.design-sync/conventions.md` |

---

### Task 1: Density tokens and `cn()` registration

**Files:**
- Modify: `src/app/globals.css` (the `@theme` block at line ~157, the `@layer base` body rule at ~190, add variants after line 4)
- Modify: `src/lib/utils.ts`
- Create: `tests/density.test.ts`

**Interfaces:**
- Produces: Tailwind utilities `text-body`, `text-body-sm`, `px-card-x`, `pl-card-x`, `pr-card-x`, `py-card`, `pb-card`, `gap-cards`, `px-gutter`, `h-row-head`, `py-cell`; CSS variable `--density-chart` (0.7 / 1); variants `compact:` and `comfortable:`. Later tasks use exactly these names.

- [ ] **Step 0: Baseline screenshots**

Before any change, with `bun run dev`, capture `/`, `/advance-decline`, `/screener`, `/stock/RELIANCE` at 1440px in dark and light into the scratchpad. Task 6 compares comfortable against these.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/density.test.ts
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { cn } from "../src/lib/utils";

const css = readFileSync("src/app/globals.css", "utf8");
const block = (sel: string) => {
  const i = css.indexOf(sel);
  expect(i).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf("}", i));
};
const VARS = [
  "--density-display", "--density-metric", "--density-metric-lh", "--density-body", "--density-body-lh",
  "--density-body-sm", "--density-body-sm-lh", "--density-card-x", "--density-card-y", "--density-cards",
  "--density-gutter", "--density-row-head", "--density-cell-y", "--density-chart",
];

describe("density tokens", () => {
  test("every density variable is set for both compact and comfortable", () => {
    const compact = block(':root,\n[data-density="compact"]');
    const comfortable = block('[data-density="comfortable"] {');
    for (const v of VARS) {
      expect({ v, compact: compact.includes(`${v}:`) }).toEqual({ v, compact: true });
      expect({ v, comfortable: comfortable.includes(`${v}:`) }).toEqual({ v, comfortable: true });
    }
  });

  test("compact holds the brief's numbers; comfortable holds today's", () => {
    const compact = block(':root,\n[data-density="compact"]');
    const comfortable = block('[data-density="comfortable"] {');
    expect(compact).toContain("--density-display: 3rem;");
    expect(compact).toContain("--density-metric: 1.375rem;");
    expect(compact).toContain("--density-body: 0.8125rem;");
    expect(compact).toContain("--density-body-sm: 0.75rem;");
    expect(compact).toContain("--density-chart: 0.7;");
    expect(comfortable).toContain("--density-display: 4rem;");
    expect(comfortable).toContain("--density-body-sm: 0.8125rem;");
    expect(comfortable).toContain("--density-chart: 1;");
  });

  test("the theme tokens read the density variables", () => {
    for (const t of ["--text-display: var(--density-display)", "--text-body: var(--density-body)",
      "--text-body-sm: var(--density-body-sm)", "--spacing-card-x: var(--density-card-x)",
      "--spacing-cards: var(--density-cards)", "--spacing-row-head: var(--density-row-head)"]) {
      expect(css).toContain(t);
    }
    expect(css).toMatch(/@custom-variant compact /);
    expect(css).toMatch(/@custom-variant comfortable /);
  });

  test("cn() knows the new type sizes", () => {
    expect(cn("text-body-sm", "text-foreground")).toBe("text-body-sm text-foreground");
    expect(cn("text-body-sm", "text-[12px]")).toBe("text-[12px]");
    expect(cn("text-body", "text-body-sm")).toBe("text-body-sm");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test tests/density.test.ts`
Expected: FAIL (`indexOf` −1 for the compact block; `cn("text-body-sm","text-foreground")` returns `"text-foreground"`).

- [ ] **Step 3: Add the variables, tokens and variants to `globals.css`**

After `@custom-variant dark (&:is(.dark *));` (line 4) add:

```css
/* density (decision 0020): the server renders data-density="compact"; prepaint.ts swaps in a stored choice */
@custom-variant compact (&:is([data-density="compact"] *));
@custom-variant comfortable (&:is([data-density="comfortable"] *));
```

Before `@theme inline {` add (unlayered, beside `:root` / `.dark`):

```css
/* Density: one value per role, swapped by data-density on <html>. Compact is the default. */
:root,
[data-density="compact"] {
  --density-display: 3rem;
  --density-metric: 1.375rem;
  --density-metric-lh: 1.75rem;
  --density-body: 0.8125rem;
  --density-body-lh: 1.25rem;
  --density-body-sm: 0.75rem;
  --density-body-sm-lh: 1.125rem;
  --density-card-x: 1rem;
  --density-card-y: 0.75rem;
  --density-cards: 0.75rem;
  --density-gutter: 1.25rem;
  --density-row-head: 1.75rem;
  --density-cell-y: 0.3125rem;
  --density-chart: 0.7;
}
[data-density="comfortable"] {
  --density-display: 4rem;
  --density-metric: 1.75rem;
  --density-metric-lh: 2rem;
  --density-body: 0.875rem;
  --density-body-lh: 1.25rem;
  --density-body-sm: 0.8125rem;
  --density-body-sm-lh: 1.25rem;
  --density-card-x: 1.25rem;
  --density-card-y: 1.25rem;
  --density-cards: 1rem;
  --density-gutter: 2rem;
  --density-row-head: 2.25rem;
  --density-cell-y: 0.625rem;
  --density-chart: 1;
}
```

In the `@theme {` block: change `--text-display: 4rem;` to `--text-display: var(--density-display);`, `--text-metric: 1.75rem;` to `--text-metric: var(--density-metric);`, `--text-metric--line-height: 2rem;` to `--text-metric--line-height: var(--density-metric-lh);`, and append:

```css
  --text-body: var(--density-body);
  --text-body--line-height: var(--density-body-lh);
  --text-body-sm: var(--density-body-sm);
  --text-body-sm--line-height: var(--density-body-sm-lh);
  --spacing-card-x: var(--density-card-x);
  --spacing-card: var(--density-card-y);
  --spacing-cards: var(--density-cards);
  --spacing-gutter: var(--density-gutter);
  --spacing-row-head: var(--density-row-head);
  --spacing-cell: var(--density-cell-y);
```

(`--spacing-card` gives `py-card`/`pb-card`; `--spacing-cell` gives `py-cell`.) In `@layer base`, change the body rule to `@apply bg-background text-foreground font-sans text-body antialiased;`.

Note: these resolve correctly because Tailwind emits `@theme` variables on `:root`, which is the same `<html>` element that carries `data-density`.

- [ ] **Step 4: Register the sizes in `src/lib/utils.ts`**

```ts
const twMerge = extendTailwindMerge({ extend: { classGroups: { "font-size": [{ text: ["display", "metric", "title", "heading", "eyebrow", "body", "body-sm"] }] } } });
```

- [ ] **Step 5: Run tests and typecheck**

Run: `bun test tests/density.test.ts tests/tailwind-v4.test.ts tests/motion.test.ts && bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Confirm Tailwind compiles the utilities**

Run: `bun run dev` (background), open `http://localhost:3000/`, and in the browser console run
`getComputedStyle(document.body).fontSize` → expect `"13px"` (compact via `:root`, before Task 2 adds the attribute). Stop the server.

- [ ] **Step 7: Commit**

```bash
git checkout -- next-env.d.ts 2>/dev/null; git add src/app/globals.css src/lib/utils.ts tests/density.test.ts
git commit -m "Density tokens: compact and comfortable values behind named Tailwind tokens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The switch — attribute, pre-paint, button, key

**Files:**
- Modify: `src/lib/prepaint.ts`, `src/app/layout.tsx`, `src/components/Hotkeys.tsx`, `src/components/SiteNav.tsx`
- Create: `src/components/DensityToggle.tsx`
- Test: `tests/density.test.ts` (append), `tests/countup.test.ts` (unchanged; must stay green)

**Interfaces:**
- Consumes: `compact:` / `comfortable:` variants (Task 1).
- Produces: `export function toggleDensity(): "compact" | "comfortable"` and `export default function DensityToggle({ compact?: boolean; className?: string })` from `src/components/DensityToggle.tsx`.

- [ ] **Step 1: Write the failing tests** (append to `tests/density.test.ts`)

```ts
import { PREPAINT_SCRIPT } from "../src/lib/prepaint";
import { toggleDensity } from "../src/components/DensityToggle";

describe("density before first paint", () => {
  const run = (stored: Record<string, string> | "blocked") => {
    const attrs: Record<string, string> = {};
    const document = { documentElement: { classList: { remove() {} }, setAttribute: (k: string, v: string) => { attrs[k] = v; } } };
    const window = { matchMedia: () => ({ matches: true }) };
    const localStorage = { getItem: (k: string) => { if (stored === "blocked") throw new Error("blocked"); return stored[k] ?? null; } };
    new Function("document", "window", "localStorage", PREPAINT_SCRIPT)(document, window, localStorage);
    return attrs["data-density"];
  };
  test("a stored comfortable choice is applied", () => expect(run({ density: "comfortable" })).toBe("comfortable"));
  test("nothing stored leaves the server's compact alone", () => expect(run({})).toBeUndefined());
  test("junk is ignored", () => expect(run({ density: "wide" })).toBeUndefined());
  test("blocked storage does not throw", () => expect(run("blocked")).toBeUndefined());
  test("layout.tsx renders compact on the server", () => {
    expect(readFileSync("src/app/layout.tsx", "utf8")).toContain('data-density="compact"');
  });
});

describe("toggleDensity", () => {
  test("flips the attribute and remembers it", () => {
    let attr = "compact";
    const saved: Record<string, string> = {};
    (globalThis as any).document = { documentElement: { getAttribute: () => attr, setAttribute: (_: string, v: string) => { attr = v; } } };
    (globalThis as any).localStorage = { setItem: (k: string, v: string) => { saved[k] = v; } };
    expect(toggleDensity()).toBe("comfortable");
    expect(attr).toBe("comfortable");
    expect(saved.density).toBe("comfortable");
    expect(toggleDensity()).toBe("compact");
    (globalThis as any).localStorage = { setItem: () => { throw new Error("blocked"); } };
    expect(toggleDensity()).toBe("comfortable"); // still switches for this visit
    delete (globalThis as any).document;
    delete (globalThis as any).localStorage;
  });
  test("the d key is wired next to t", () => {
    const src = readFileSync("src/components/Hotkeys.tsx", "utf8");
    expect(src).toContain('e.key === "d"');
    expect(src).toContain("toggleDensity()");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test tests/density.test.ts`
Expected: FAIL (cannot resolve `../src/components/DensityToggle`).

- [ ] **Step 3: Pre-paint and layout**

In `src/lib/prepaint.ts`, insert before the final `})()` (keep its own try/catch, per `src/lib/CLAUDE.md`):

```js
try{var n=localStorage.getItem("density");if(n==="compact"||n==="comfortable")d.setAttribute("data-density",n)}catch(e){}
```

In `src/app/layout.tsx`, add `data-density="compact"` to `<html>` next to `className`. Update the comment in `prepaint.ts` to say it also applies a stored density.

- [ ] **Step 4: Create `src/components/DensityToggle.tsx`**

```tsx
"use client";

import { Rows3, Rows4 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Flips compact ↔ comfortable and remembers it; prepaint.ts reads it back before first paint. */
export function toggleDensity(): "compact" | "comfortable" {
  const root = document.documentElement;
  const next = root.getAttribute("data-density") === "comfortable" ? "compact" : "comfortable";
  root.setAttribute("data-density", next);
  try {
    localStorage.setItem("density", next);
  } catch {
    // storage blocked (private window): the switch still works for this visit
  }
  return next;
}

/*
 * No React state, like ThemeToggle: the `compact:` / `comfortable:` variants pick
 * the icon and label, so the server render and the first client render agree.
 */
export default function DensityToggle({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={toggleDensity}
      aria-label="Switch between compact and comfortable spacing"
      title="Switch spacing (d)"
      className={cn(
        "inline-flex items-center gap-2 rounded-md text-body-sm font-medium text-foreground-2 transition-colors hover:bg-raised hover:text-foreground",
        compact ? "size-9 justify-center" : "h-9 px-2.5",
        className,
      )}
    >
      <Rows3 className="size-4 comfortable:hidden" aria-hidden="true" />
      <Rows4 className="hidden size-4 comfortable:block" aria-hidden="true" />
      {!compact && (
        <>
          <span className="comfortable:hidden">Comfortable spacing</span>
          <span className="hidden comfortable:inline">Compact spacing</span>
          <kbd className="ml-auto rounded-sm border px-1.5 font-mono text-[10px] leading-4 text-muted-foreground">d</kbd>
        </>
      )}
    </button>
  );
}
```

(The icon and label name what the click switches *to*, as `ThemeToggle` does.)

- [ ] **Step 5: Wire the key and the nav**

`src/components/Hotkeys.tsx`: import `{ toggleDensity } from "@/components/DensityToggle"`; after the `t` block add

```ts
      if (e.key === "d") {
        e.preventDefault();
        toggleDensity();
        return;
      }
```

and change the doc comment's last clause to "t flips the theme, d the spacing."

`src/components/SiteNav.tsx`: import `DensityToggle`; replace `<ThemeToggle className="w-full" />` with

```tsx
          <div className="flex flex-col gap-1">
            <ThemeToggle className="w-full" />
            <DensityToggle className="w-full" />
          </div>
```

and after `<ThemeToggle compact />` in the mobile header add `<DensityToggle compact />`.

- [ ] **Step 6: Run tests and typecheck**

Run: `bun test tests/density.test.ts tests/countup.test.ts tests/hotkeys.test.ts && bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git checkout -- next-env.d.ts 2>/dev/null; git add src/lib/prepaint.ts src/app/layout.tsx src/components/DensityToggle.tsx src/components/Hotkeys.tsx src/components/SiteNav.tsx tests/density.test.ts
git commit -m "Density switch: server renders compact, pre-paint applies a stored choice, sidebar button and d key

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Body type through the tokens

**Files:**
- Modify: every file under `src/` containing `text-[13px]` (29 files, 70 uses) or `text-sm` (`ui/table.tsx` ×2, `ui/calendar.tsx` ×3, `ui/button.tsx` ×1)
- Test: `tests/density.test.ts` (append)

**Interfaces:**
- Consumes: `text-body`, `text-body-sm` (Task 1).

- [ ] **Step 1: Write the failing test**

```ts
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const srcFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? srcFiles(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
const hits = (re: RegExp, skip: string[] = []) =>
  srcFiles("src").filter((f) => !skip.some((s) => f.endsWith(s))).flatMap((f) =>
    readFileSync(f, "utf8").split("\n").flatMap((l, i) => (re.test(l) ? [`${f}:${i + 1}`] : [])),
  );

describe("body type follows density", () => {
  test("no raw 13px or text-sm left", () => {
    expect(hits(/text-\[13px\]|\btext-sm\b/)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test tests/density.test.ts -t "no raw 13px"`
Expected: FAIL listing ~76 lines.

- [ ] **Step 3: Replace mechanically**

```bash
grep -rlE 'text-\[13px\]' src | xargs sed -i '' 's/text-\[13px\]/text-body-sm/g'
grep -rlE '\btext-sm\b' src | xargs sed -i '' -E 's/([" ])text-sm([" ])/\1text-body\2/g'
```

Then `grep -rn 'text-sm\b' src` must print nothing; fix any left by hand. Where a replaced class sits beside an explicit `leading-5` that only existed to give 13px a 20px line, leave it (it matches comfortable and is 2px roomier in compact; harmless).

- [ ] **Step 4: Run all tests and typecheck**

Run: `bun test && bunx tsc --noEmit`
Expected: PASS (the glossary/readout tests render components; none assert class names).

- [ ] **Step 5: Commit**

```bash
git checkout -- next-env.d.ts 2>/dev/null; git add -A src tests/density.test.ts
git commit -m "Body text through text-body / text-body-sm so it follows density

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Cards, tables, gutter, gaps and charts

**Files:**
- Modify: `src/components/ui/card.tsx`, `src/components/ui/table.tsx`, `src/components/AppShell.tsx`, `src/components/Readout.tsx`
- Modify (card padding): `BreadthHero`, `AdHero`, `LearnList`, `StockList`, `ScreenerTable`, `BreadthArea`, `ForwardReturns`, `MemberTable`, `CrashTable`, `StockChecks`, `RiskCalculator`, `StockPriceChart`, `AdLineChart`, `DrawdownChart`, `StockEvents`, `McClellanBars`, `WashoutCard`, `EpisodeTable`, `AdRecentTable`, `CrossingsTable` (all in `src/components/`), `src/app/learn/[id]/page.tsx`, `src/app/screener/page.tsx`
- Modify (tables): `ScreenerTable`, `MemberTable`, `CrossingsTable`, `AdRecentTable`, `ForwardReturns`, `EpisodeTable`, `CrashTable`
- Modify (charts): `BreadthArea` (300), `StockPriceChart` (260), `AdLineChart` (260), `DrawdownChart` (220), `McClellanBars` (230), `ReturnBuckets` (240), `WashoutSpark` (140)
- Modify (page grids): `src/app/page.tsx`, `advance-decline/page.tsx`, `signals/page.tsx`, `crossings/page.tsx`, `screener/page.tsx`, `stock/[symbol]/page.tsx`, `learn/[id]/page.tsx`
- Test: `tests/density.test.ts` (append)

**Interfaces:**
- Consumes: `px-card-x`, `pl-card-x`, `pr-card-x`, `py-card`, `pb-card`, `gap-cards`, `lg:px-gutter`, `h-row-head`, `py-cell`, `--density-chart`, `comfortable:` (Task 1).

- [ ] **Step 1: Write the failing tests**

```ts
describe("spacing follows density", () => {
  test("no fixed 20px card inset left outside the sidebar and button sizes", () => {
    expect(hits(/\b(p|px|pl|pr|pb)-5\b/, ["ui/button.tsx", "SiteNav.tsx"])).toEqual([]);
  });
  test("page grids and tiles use gap-cards", () => {
    const pages = srcFiles("src/app").filter((f) => f.endsWith("page.tsx"));
    expect(pages.flatMap((f) => (/\bgap-4\b/.test(readFileSync(f, "utf8")) ? [f] : []))).toEqual([]);
    expect(readFileSync("src/components/Readout.tsx", "utf8")).toContain("gap-cards");
  });
  test("the gutter from lg is a token", () => {
    const shell = readFileSync("src/components/AppShell.tsx", "utf8");
    expect(shell).toContain("lg:px-gutter");
    expect(shell).not.toContain("lg:px-8");
  });
  test("table rows and headers use the row tokens", () => {
    // every py-2 / py-2.5 in these files is a table cell (cn() calls span lines, so check whole files)
    const tables = ["ScreenerTable", "MemberTable", "CrossingsTable", "AdRecentTable", "ForwardReturns", "EpisodeTable", "CrashTable"];
    for (const t of tables) {
      const src = readFileSync(`src/components/${t}.tsx`, "utf8");
      expect({ t, py2: /\bpy-2(\.5)?\b/.test(src), h9: /\bh-9\b/.test(src) }).toEqual({ t, py2: false, h9: false });
    }
    const table = readFileSync("src/components/ui/table.tsx", "utf8");
    expect(table).toContain("h-row-head");
    expect(table).toContain("py-cell");
  });
  test("every chart height scales with density", () => {
    const charts = hits(/<ChartContainer\b/);
    expect(charts.length).toBeGreaterThanOrEqual(7);
    expect(hits(/<ChartContainer\b[^>]*\bh-\[\d+px\]/)).toEqual([]);
    expect(hits(/h-\[calc\(\d+px\*var\(--density-chart\)\)\]/).length).toBe(7);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test tests/density.test.ts -t "spacing follows density"`
Expected: FAIL on all five.

- [ ] **Step 3: Base components**

- `ui/card.tsx`: `CardHeader` → `"flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-card-x pb-3 pt-4"`; `CardContent` → `"px-card-x pb-card"`; `CardFooter` → replace `px-5` with `px-card-x`.
- `ui/table.tsx`: `TableHead` `h-12 px-4` → `h-row-head px-4`; `TableCell` `p-4` → `px-4 py-cell`.
- `AppShell.tsx`: `lg:px-8` → `lg:px-gutter`.
- `Readout.tsx`: `"grid grid-cols-2 gap-3 sm:gap-4"` → `"grid grid-cols-2 gap-cards"`. Tile padding `p-4` stays.

- [ ] **Step 4: Card padding in the listed components and pages**

Rules, applied file by file (read each hit; these are all inside cards):
- `px-5` → `px-card-x`; `pl-5` → `pl-card-x`; `pr-5` → `pr-card-x`; `last:pr-5` → `last:pr-card-x`.
- `pb-5` → `pb-card`.
- `p-5` → `px-card-x py-card`.
- Heroes (`BreadthHero.tsx:38`, `AdHero.tsx:43`): `p-5 sm:p-6` → `px-card-x py-card sm:comfortable:p-6` (comfortable keeps today's 24px from `sm`).

Run `grep -rnE '\b(p|px|pl|pr|pb)-5\b' src | grep -vE 'ui/button|SiteNav'` → empty.

- [ ] **Step 5: Table rows and headers**

- In `ScreenerTable`, `MemberTable`, `CrossingsTable`: `const head = "h-9 px-3 …"` → `"h-row-head px-3 …"`.
- In `ForwardReturns`, `EpisodeTable`: `const head = "px-3 py-2 …"` → `"h-row-head px-3 …"`.
- In `CrashTable` `<th>`s: `py-2` → `h-row-head`.
- In every `<td>` / `<TableCell>` of those seven files: `py-2.5` and `py-2` → `py-cell`.
Leave non-table `py-2`/`py-2.5` (LearnList links, WashoutNotice, StockEvents list items, SiteNav, chart tooltip) alone.

- [ ] **Step 6: Chart heights**

In each of the seven chart components, replace `h-[Npx]` on the `ChartContainer` with `h-[calc(Npx*var(--density-chart))]`, keeping N (300, 260, 260, 220, 230, 240, 140). Leave `MemberTable`'s `min-h-[240px]` and the table `max-h-[520px]`/`max-h-[560px]` caps (not charts).

- [ ] **Step 7: Page grids**

Replace `gap-4` with `gap-cards` in the page-level grids/stacks: `page.tsx:167`, `advance-decline/page.tsx:152`, `signals/page.tsx:52`, `crossings/page.tsx:94`, `screener/page.tsx:174` and `:237`, `stock/[symbol]/page.tsx:103` and `:112`, `learn/[id]/page.tsx:37`. `crossings/page.tsx:51` `mb-4` (Readout above the grid) → `mb-cards`.

- [ ] **Step 8: Run all tests, typecheck, and the tailwind guard**

Run: `bun test && bunx tsc --noEmit`
Expected: PASS (includes `tailwind-v4.test.ts`: `var(--density-chart)` inside `calc()` is not the forbidden `-[--var]` form).

- [ ] **Step 9: Commit**

```bash
git checkout -- next-env.d.ts 2>/dev/null; git add -A src tests/density.test.ts
git commit -m "Cards, tables, gutter, gaps and charts follow density

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Hero, then four tiles in a row

**Files:**
- Modify: `src/app/page.tsx:170,181`, `src/app/advance-decline/page.tsx:154,162`
- Test: `tests/density.test.ts` (append)

**Interfaces:**
- Consumes: `compact:` variant (Task 1).

- [ ] **Step 1: Write the failing test**

```ts
describe("hero layout follows density", () => {
  for (const f of ["src/app/page.tsx", "src/app/advance-decline/page.tsx"]) {
    test(`${f}: compact puts the hero full width and four tiles beneath it`, () => {
      const src = readFileSync(f, "utf8");
      expect(src).toContain('className="lg:col-span-12 xl:col-span-7 xl:compact:col-span-12"');
      expect(src).toContain('className="lg:col-span-12 lg:grid-cols-4 xl:col-span-5 xl:grid-cols-2 xl:compact:col-span-12 xl:compact:grid-cols-4"');
    });
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test tests/density.test.ts -t "hero layout"`
Expected: FAIL.

- [ ] **Step 3: Implement**

In both pages: hero `className="lg:col-span-12 xl:col-span-7"` → `"lg:col-span-12 xl:col-span-7 xl:compact:col-span-12"`; Readout `className="lg:col-span-12 lg:grid-cols-4 xl:col-span-5 xl:grid-cols-2"` → `"lg:col-span-12 lg:grid-cols-4 xl:col-span-5 xl:grid-cols-2 xl:compact:col-span-12 xl:compact:grid-cols-4"`. (Different modifiers, so `cn()` keeps both; the `compact` selector adds specificity, so it wins at `xl`.)

- [ ] **Step 4: Run tests**

Run: `bun test tests/density.test.ts && bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Browser check (Review Focus 5)**

`bun run dev`; on `/` and `/advance-decline` at widths 1024, 1280, 1440 and 390: compact shows the hero full width with four tiles in one row beneath it (two-by-two at 390, as today's `grid-cols-2`); no tile value is truncated; the hero's histogram fills the width without a dead half. Press `d`: the 7/5 split with a 2×2 returns. If the hero looks empty at full width, record it for the owner rather than redesigning.

- [ ] **Step 6: Commit**

```bash
git checkout -- next-env.d.ts 2>/dev/null; git add src/app/page.tsx src/app/advance-decline/page.tsx tests/density.test.ts
git commit -m "Compact Breadth and A/D: hero full width, four tiles in one row

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Visual check, docs and decision 0020

**Files:**
- Modify: `docs/design/system/README.md`, `CLAUDE.md` ("Theme and tokens"), `src/lib/CLAUDE.md`, `src/components/CLAUDE.md` (if it lists toggles), `.design-sync/conventions.md` (type-scale row: `text-body-sm` body, `text-[12px]` captions), `docs/superpowers/specs/2026-10-04-ui-density-design.md` (mark amendments)
- Create: `docs/decisions/0020-ui-density.md`; add a row to `docs/decisions/README.md`

- [ ] **Step 1: Screenshots in both densities × both themes**

With `bun run dev`, capture `/`, `/advance-decline`, `/screener`, `/stock/RELIANCE` in compact-dark, compact-light, comfortable-dark, comfortable-light at 1440px. Check: comfortable matches the Task 1 baseline screenshots (allowing the ≤4px header difference on the hand-built tables); table rows ~28px in compact (`document.querySelector("tbody tr").getBoundingClientRect().height`); `d` in the risk calculator's amount field types a "d" (Review Focus 4).

- [ ] **Step 2: First paint with comfortable stored (Review Focus 1)**

In the console run `localStorage.setItem("density","comfortable")`, then record a reload in the Performance panel with Screenshots on: the first painted frame already shows comfortable spacing and the reported layout shift (CLS) is 0. Then `localStorage.setItem("density","wide")`, reload: the page is compact and the console shows no error.

- [ ] **Step 3: Design-system README**

In `docs/design/system/README.md`:
- `## Type`: display 48/48 (comfortable 64/64), metric 22/28 (28/32), body 13/20 (14/20), body-sm 12/18 (13/20); name the utilities `text-body`, `text-body-sm`.
- "Space, shape and depth": card inset 16 side / 12 body / 16 header top (comfortable 20/20/16); gaps 12 (16); gutter from `lg` 20 (32); utilities `px-card-x`, `py-card`, `gap-cards`, `lg:px-gutter`.
- Tables: header 28 (36), rows ~28 (~40), `h-row-head`, `py-cell`.
- Charts: heights written as `h-[calc(Npx*var(--density-chart))]`, N = the comfortable height.
- New `## Density` section: what the attribute does, compact default, the `d` key and sidebar button, `compact:`/`comfortable:` for layout, and the Breadth/A/D hero row.

- [ ] **Step 4: Decision 0020 (plain language, per the project's rule)**

`docs/decisions/0020-ui-density.md`: the problem (too little per screen), the options (one-off shrink; a React setting; CSS variables behind one attribute), the decision (variables + attribute, compact default, remembered switch) and why (one place to change, no flash on load, the old spacing one key away), what changed per page, the known small differences (comfortable hand-built tables gain ≤4px header height; body-sm and caption share 12px in compact), and how to add a new size or spacing (variable in both blocks + `@theme` token + `utils.ts` for type). Add the README row.

- [ ] **Step 5: CLAUDE.md files**

Root `CLAUDE.md` "Theme and tokens": add one sentence — density is `data-density` on `<html>` (server `compact`, stored choice applied by the same pre-paint script); spacing/type that density controls uses the `--density-*` tokens (`text-body-sm`, `px-card-x`, `gap-cards`, `h-row-head`, `py-cell`, chart `calc(...*var(--density-chart))`), never raw px. `src/lib/CLAUDE.md`: `prepaint.ts` row mentions density; `utils.ts` row lists `body`, `body-sm`.

- [ ] **Step 6: Mark spec amendments**

In the spec's token table, mark "(amended while planning)": card header top stays `pt-4` (no `--spacing-card-head` token); table header comfortable is 36px (`h-9`, what tables use today); `px-card-x` also replaces `pl-5`/`pr-5`; stat tile padding unchanged; heroes keep `sm:p-6` in comfortable.

- [ ] **Step 7: Full suite and commit**

Run: `bun test && bunx tsc --noEmit && bun run audit:report-card`
Expected: PASS, 0 mismatches.

```bash
git checkout -- next-env.d.ts 2>/dev/null; git add -A docs CLAUDE.md src/lib/CLAUDE.md src/components/CLAUDE.md .design-sync/conventions.md
git commit -m "Density docs: design-system README, decision 0020, CLAUDE.md notes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Offer the Claude Design re-sync**

Tell the owner the uploaded design system still has the old sizes and vocabulary; offer `/design-sync` (re-sync to the pinned project). Do not run it unasked.
