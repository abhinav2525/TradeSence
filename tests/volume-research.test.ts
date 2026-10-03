import { test, expect, describe } from "bun:test";
import { adjustedBars, cmf, mfi, obv, type Bars } from "../src/research/volume";
import type { History } from "../src/indicators/history";

const day = (i: number) => {
  const d = new Date(Date.UTC(2020, 0, 1));
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
};
const bars = (high: number[], low: number[], close: number[], volume: number[], dates?: string[]): Bars =>
  ({ dates: dates ?? close.map((_, i) => day(i)), high, low, close, volume });

describe("cmf", () => {
  test("hand-worked: closes at high, middle and low", () => {
    const out = cmf(bars([10, 10, 10], [0, 0, 0], [10, 5, 0], [100, 100, 200]), 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeCloseTo(-0.25, 12); // (100 + 0 − 200) ÷ 400
  });
  test("a day with high = low adds volume but no flow", () => {
    expect(cmf(bars([5, 5], [5, 5], [5, 5], [10, 10]), 2)[1]).toBe(0);
  });
  test("restarts after a hole in the data", () => {
    const out = cmf(bars([10, 10, 10], [0, 0, 0], [10, 10, 10], [1, 1, 1], ["2020-01-01", "2020-01-02", "2020-03-01"]), 2);
    expect(out).toEqual([null, 1, null]);
  });
});

describe("mfi", () => {
  test("only rising typical prices: 100", () => {
    expect(mfi(bars([10, 11, 12], [10, 11, 12], [10, 11, 12], [1, 1, 1]), 2)[2]).toBe(100);
  });
  test("hand-worked mixed: 100 − 100 ÷ (1 + 11/10)", () => {
    const out = mfi(bars([10, 11, 10], [10, 11, 10], [10, 11, 10], [1, 1, 1]), 2);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeCloseTo(100 - 100 / 2.1, 12);
  });
  test("unchanged typical price is neither: 50 when no flow either way", () => {
    expect(mfi(bars([10, 10, 10], [10, 10, 10], [10, 10, 10], [1, 1, 1]), 2)[2]).toBe(50);
  });
});

describe("obv", () => {
  test("adds on up closes, subtracts on down, holds on unchanged", () => {
    expect(obv(bars([0, 0, 0, 0], [0, 0, 0, 0], [10, 11, 11, 9], [100, 50, 70, 30]))).toEqual([0, 50, 50, 20]);
  });
  test("restarts at 0 after a hole", () => {
    expect(obv(bars([0, 0, 0], [0, 0, 0], [10, 11, 12], [5, 5, 5], ["2020-01-01", "2020-01-02", "2020-03-01"]))).toEqual([0, 5, 0]);
  });
});

test("adjustedBars: a 1:2 split inside the window looks like no split at all", () => {
  const dates = [day(0), day(1), day(2), day(3)];
  const split: History = {
    dates, open: [200, 200, 100, 100], high: [210, 204, 103, 101], low: [190, 196, 97, 99], close: [200, 202, 100, 100],
    volume: [100, 120, 260, 200], turnover: [0, 0, 0, 0], factors: [2, 2, 1, 1], shareFactors: [2, 2, 1, 1],
  };
  const none: History = {
    dates, open: [100, 100, 100, 100], high: [105, 102, 103, 101], low: [95, 98, 97, 99], close: [100, 101, 100, 100],
    volume: [200, 240, 260, 200], turnover: [0, 0, 0, 0], factors: [1, 1, 1, 1], shareFactors: [1, 1, 1, 1],
  };
  expect(adjustedBars(split)).toEqual(adjustedBars(none));
  expect(cmf(adjustedBars(split), 3)).toEqual(cmf(adjustedBars(none), 3));
});
