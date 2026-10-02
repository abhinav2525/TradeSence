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
