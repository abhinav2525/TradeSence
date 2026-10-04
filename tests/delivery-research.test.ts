import { test, expect, describe } from "bun:test";
import type { History } from "../src/indicators/history";
import { windowMean, stockSeries, WINDOW } from "../src/research/delivery";

/** n consecutive weekdays from 2021-01-04, all fields filled, liquid. */
function hist(n: number, over: Partial<Record<keyof History, unknown[]>> = {}): History {
  const dates: string[] = [];
  const d = new Date("2021-01-04T00:00:00Z");
  while (dates.length < n) {
    if (d.getUTCDay() % 6 !== 0) dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const fill = <T,>(v: T) => dates.map(() => v);
  return {
    dates, open: fill(100), high: fill(101), low: fill(99), close: fill(100), volume: fill(1000),
    turnover: fill(2e7), factors: fill(1), shareFactors: fill(1), traded: fill(1000), delivered: fill(500),
    ...over,
  } as History;
}

describe("windowMean", () => {
  const segs = [[0, 1, 2, 3, 4]];
  test("offset 1 averages the sessions before i, offset 0 includes i", () => {
    const v = Array.from({ length: 30 }, (_, i) => i);
    const s = [v.map((_, i) => i)];
    expect(windowMean(v, s, 1)[25]).toBe((5 + 24) / 2); // sessions 5..24
    expect(windowMean(v, s, 0)[25]).toBe((6 + 25) / 2); // sessions 6..25
  });
  test("null with fewer than 15 values present", () => {
    expect(windowMean([1, 2, 3, 4, 5], segs, 1)[4]).toBeNull();
  });
  test("missing values are skipped, not counted as zero", () => {
    const v: (number | null)[] = Array.from({ length: 21 }, () => 10);
    v[3] = null;
    expect(windowMean(v, [v.map((_, i) => i)], 1)[20]).toBe(10);
  });
  test("never reaches across a segment boundary", () => {
    const v = Array.from({ length: 40 }, () => 1);
    const s = [Array.from({ length: 20 }, (_, i) => i), Array.from({ length: 20 }, (_, i) => i + 20)];
    expect(windowMean(v, s, 1)[25]).toBeNull(); // only 5 sessions into the second segment
  });
});

describe("stockSeries", () => {
  test("delivery % is delivered ÷ traded × 100", () => {
    expect(stockSeries(hist(30)).dp[0]).toBe(50);
  });

  test("rel is today's delivery % minus the previous 20 sessions' average", () => {
    const delivered = Array.from({ length: 30 }, () => 500);
    delivered[25] = 800;
    const s = stockSeries(hist(30, { delivered }));
    expect(s.rel[25]).toBeCloseTo(30, 9);
  });

  test("the five excluded days carry no figure", () => {
    const h = hist(30);
    h.dates[22] = "2019-06-17"; // only the label matters for this rule
    expect(stockSeries(h).dp[22]).toBeNull();
  });

  test("nothing traded is no figure, not 0% or a division by zero", () => {
    const traded = Array.from({ length: 30 }, () => 1000);
    traded[10] = 0;
    expect(stockSeries(hist(30, { traded })).dp[10]).toBeNull();
  });

  test("a 1:2 split inside the window doesn't fake a delivery spike", () => {
    // raw delivered doubles on the ex-date; shareFactors 2 before it, 1 after
    const delivered = Array.from({ length: 30 }, (_, i) => (i < 15 ? 500 : 1000));
    const traded = Array.from({ length: 30 }, (_, i) => (i < 15 ? 1000 : 2000));
    const shareFactors = Array.from({ length: 30 }, (_, i) => (i < 15 ? 2 : 1));
    const factors = shareFactors;
    const close = Array.from({ length: 30 }, (_, i) => (i < 15 ? 200 : 100));
    const s = stockSeries(hist(30, { delivered, traded, shareFactors, factors, close }));
    expect(s.spike[25]).toBeCloseTo(1, 9);
    expect(s.move[15]).toBeCloseTo(0, 9); // adjusted close flat across the split
  });

  test("returns start from the next session's close, never the signal day's", () => {
    const close = Array.from({ length: 40 }, (_, i) => 100 + i);
    const s = stockSeries(hist(40, { close }));
    // 5-session return for D = 20: close[21] → close[26]
    expect(s.returns[0]![20]).toBeCloseTo((126 / 121 - 1) * 100, 9);
  });

  test("no return when D+1 starts a new segment", () => {
    const h = hist(30);
    h.dates = h.dates.map((d, i) => (i >= 21 ? `2022-0${Math.floor(i / 10)}-1${i % 10}` : d));
    expect(stockSeries(h).returns[0]![20]).toBeNull();
  });

  test("eligible needs liquidity: a stock trading under ₹1 crore a day never counts", () => {
    const s = stockSeries(hist(30, { turnover: Array.from({ length: 30 }, () => 5e6) }));
    expect(s.eligible.some(Boolean)).toBe(false);
  });

  test("eligible from the first day with a usual level and 20 sessions of turnover", () => {
    const s = stockSeries(hist(30));
    expect(s.eligible.indexOf(true)).toBe(WINDOW - 1);
  });

  test("a company with no delivery rows is never eligible", () => {
    const none = Array.from({ length: 30 }, () => null);
    const s = stockSeries(hist(30, { traded: none, delivered: none }));
    expect(s.eligible.some(Boolean)).toBe(false);
  });
});
