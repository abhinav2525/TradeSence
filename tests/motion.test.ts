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
