import { test, expect, describe } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
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
