import { test, expect, describe } from "bun:test";
import { sma, ema } from "../src/indicators/moving-average";

describe("sma", () => {
  test("is null until there are enough points, then averages the window", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  test("returns all nulls when the series is shorter than the period", () => {
    expect(sma([1, 2], 5)).toEqual([null, null]);
  });

  test("equals the constant value for a flat series", () => {
    expect(sma([7, 7, 7, 7], 2)).toEqual([null, 7, 7, 7]);
  });
});

describe("ema", () => {
  test("seeds with the SMA of the first period, then applies the recurrence", () => {
    // period 5 => k = 2/6. Flat 100, one spike to 120, then flat again.
    const out = ema([100, 100, 100, 100, 120, 100, 100], 5);
    expect(out.slice(0, 4)).toEqual([null, null, null, null]);
    expect(out[4]).toBeCloseTo(104.0, 6); // seed = SMA(5)
    expect(out[5]).toBeCloseTo(102.6667, 3);
    expect(out[6]).toBeCloseTo(101.7778, 3);
  });

  test("decays a spike faster than the SMA holds it", () => {
    const series = [100, 100, 100, 100, 120, 100, 100];
    const s = sma(series, 5);
    const e = ema(series, 5);
    // SMA still carries the spike at full weight; EMA has already faded it.
    expect(s[6]).toBeCloseTo(104.0, 6);
    expect(e[6]!).toBeLessThan(s[6]!);
  });

  test("stays at the constant value for a flat series", () => {
    const out = ema([50, 50, 50, 50, 50], 3);
    expect(out[4]).toBeCloseTo(50, 6);
  });

  test("returns all nulls when the series is shorter than the period", () => {
    expect(ema([1, 2], 5)).toEqual([null, null]);
  });
});
