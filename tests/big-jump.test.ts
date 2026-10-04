import { test, expect, describe } from "bun:test";
import { BIG_JUMP_PCT, isBigJump } from "../src/indicators/activity";
import { filterBigJumps } from "../src/query/activity";

describe("big price jump (study 0005)", () => {
  test("+8% or more on the day counts; exactly 8 and a float hair under count", () => {
    expect(BIG_JUMP_PCT).toBe(8);
    expect(isBigJump(8)).toBe(true);
    expect(isBigJump(7.999999999999999)).toBe(true);
    expect(isBigJump(12.4)).toBe(true);
    expect(isBigJump(7.9)).toBe(false);
  });
  test("falls and missing moves never count", () => {
    expect(isBigJump(-9)).toBe(false);
    expect(isBigJump(null)).toBe(false);
  });
  test("filterBigJumps keeps only rows that jumped 8%+", () => {
    const rows = [{ symbol: "A", changePct: 9 }, { symbol: "B", changePct: 3 }, { symbol: "C", changePct: null }];
    expect(filterBigJumps(rows).map((r) => r.symbol)).toEqual(["A"]);
  });
});
