import { test, expect, describe } from "bun:test";
import { tileToday } from "../src/lib/tile-today";

describe("tileToday", () => {
  test("a tile that is the term's current reading shows its value", () => {
    expect(tileToday({ value: "35.7", unit: "%" })).toBe("35.7%");
    expect(tileToday({ value: "−58.8" })).toBe("−58.8");
    expect(tileToday({ value: "1.4", unit: "×" })).toBe("1.4×");
  });
  test("an aggregate tile opts out with today: null, or says its own sentence", () => {
    expect(tileToday({ value: "52", unit: "%", today: null })).toBeUndefined();
    expect(tileToday({ value: "108", today: "GAIL, 1 crossing" })).toBe("GAIL, 1 crossing");
  });
});
