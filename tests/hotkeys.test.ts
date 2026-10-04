import { test, expect, describe } from "bun:test";
import { hotkeyTarget } from "../src/components/hotkey-target";

const breadth = { page: "breadth" as const, ma: "sma200", prev: "2026-09-30", next: null };
const card = { page: "stock" as const, ma: "sma200", prev: "2026-09-30", next: "2026-10-02", base: "/stock/M%26M", extra: "&h=1y" };

describe("hotkeyTarget", () => {
  test("pages keep their existing keys", () => {
    expect(hotkeyTarget("ArrowLeft", breadth)).toBe("/?ma=sma200&date=2026-09-30");
    expect(hotkeyTarget("ArrowRight", breadth)).toBeNull(); // no next session
    expect(hotkeyTarget("2", breadth)).toBe("/?ma=ema200");
    expect(hotkeyTarget("s", breadth)).toBe("/screener?ma=sma200");
  });

  test("on a Report Card, arrows step that stock's sessions and keep the horizon", () => {
    expect(hotkeyTarget("ArrowLeft", card)).toBe("/stock/M%26M?ma=sma200&date=2026-09-30&h=1y");
    expect(hotkeyTarget("ArrowRight", card)).toBe("/stock/M%26M?ma=sma200&date=2026-10-02&h=1y");
  });

  test("on a Report Card, 1/2/3 do nothing (the card has no average to switch)", () => {
    for (const k of ["1", "2", "3"]) expect(hotkeyTarget(k, card)).toBeNull();
  });

  test("r opens the Report Card list from anywhere", () => {
    expect(hotkeyTarget("r", breadth)).toBe("/stock");
  });
});

test("l opens Learn from anywhere", () => {
  expect(hotkeyTarget("l", { page: "breadth", ma: "sma200" })).toBe("/learn");
});

test("g opens Signals from anywhere, keeping the average", () => {
  expect(hotkeyTarget("g", { page: "breadth", ma: "ema200" })).toBe("/signals?ma=ema200");
});

test("on Signals, 1/2/3 do nothing: the page always uses the 200-day SMA", () => {
  for (const k of ["1", "2", "3"]) expect(hotkeyTarget(k, { page: "signals", ma: "sma200" })).toBeNull();
});

test("u opens Unusual activity, and 1-3 do nothing there (no average to switch)", () => {
  expect(hotkeyTarget("u", { page: "screener", ma: "sma200" })).toBe("/activity?ma=sma200");
  expect(hotkeyTarget("1", { page: "activity", ma: "sma200" })).toBeNull();
});

test("v opens Top volume, and 1-3 do nothing there", () => {
  expect(hotkeyTarget("v", { page: "screener", ma: "sma200" })).toBe("/volume?ma=sma200");
  expect(hotkeyTarget("1", { page: "volume", ma: "sma200" })).toBeNull();
});
