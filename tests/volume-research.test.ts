import { test, expect, describe } from "bun:test";
import {
  LUCK_BAR, adjustedBars, cmf, crossFlags, distinctMonths, episodeStarts, excessReturn, fifthCuts, fifthOf, judge,
  luckCheck, memberFlags, mfi, mulberry32, obv, panicThenStampede, quietFlags, rollingMean, sameWay, upShare,
  verdictOf, type Bars,
} from "../src/research/volume";
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

describe("market-wide", () => {
  test("upShare: % of traded value in rising stocks; exactly 90 and 10 are kept exact", () => {
    expect(upShare(300, 100)).toBe(75);
    expect(upShare(90, 10)).toBe(90);
    expect(upShare(10, 90)).toBe(10);
    expect(upShare(0, 0)).toBeNull();
  });
  test("rollingMean: null until the window fills, and for any window holding a null", () => {
    expect(rollingMean([day(0), day(1), day(2), day(3)], [1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
    expect(rollingMean([day(0), day(1), day(2)], [1, null, 3], 2)).toEqual([null, null, null]);
  });
  test("panicThenStampede: a stampede within 10 sessions after a panic", () => {
    const d = (n: number) => Array.from({ length: n }, (_, i) => day(i));
    expect(panicThenStampede(d(3), [5, 50, 95])).toEqual([false, false, true]);
    expect(panicThenStampede(d(11), [5, ...Array(9).fill(50), 95])[10]).toBe(true); // 10 after
    expect(panicThenStampede(d(12), [5, ...Array(10).fill(50), 95])[11]).toBe(false); // 11 after
    expect(panicThenStampede(d(2), [95, 5])).toEqual([false, false]); // wrong order
  });
});

describe("per stock", () => {
  test("quietFlags: price down while OBV up is quiet buying, and the reverse", () => {
    const b = bars([0, 0], [0, 0], [10, 9], [0, 0]);
    expect(quietFlags(b, [0, 50], 1)).toEqual({ buying: [false, true], selling: [false, false] });
    expect(quietFlags(bars([0, 0], [0, 0], [10, 11], [0, 0]), [0, -5], 1).selling).toEqual([false, true]);
  });
  test("crossFlags: heavy ≥ 2×, light < 1.5×, in between is neither; needs both averages and no hole", () => {
    const dates = [day(0), day(1)];
    expect(crossFlags(dates, [9, 11], [10, 10], [1, 2]).aboveHeavy).toEqual([false, true]);
    expect(crossFlags(dates, [9, 11], [10, 10], [1, 1.2]).aboveLight).toEqual([false, true]);
    const mid = crossFlags(dates, [9, 11], [10, 10], [1, 1.7]);
    expect(mid.aboveHeavy[1] || mid.aboveLight[1]).toBe(false);
    expect(crossFlags(dates, [11, 9], [10, 10], [1, 3]).belowHeavy).toEqual([false, true]);
    expect(crossFlags(dates, [9, 11], [null, 10], [1, 3]).aboveHeavy[1]).toBe(false);
    expect(crossFlags(["2020-01-01", "2020-03-01"], [9, 11], [10, 10], [1, 3]).aboveHeavy[1]).toBe(false);
  });
});

describe("study machinery", () => {
  test("excessReturn: stock minus NIFTY over the same sessions; null without both", () => {
    const dates = [day(0), day(1)];
    const nifty = new Map([[day(0), 100], [day(1), 105]]);
    expect(excessReturn([100, 110], [0, 0], dates, nifty, 0, 1)).toBeCloseTo(5, 12);
    expect(excessReturn([100, 110], [0, 0], dates, new Map([[day(0), 100]]), 0, 1)).toBeNull();
    expect(excessReturn([100, 110], [0, 1], dates, nifty, 0, 1)).toBeNull(); // a hole
  });

  test("fifths: cut points and which fifth a value falls in", () => {
    const cuts = fifthCuts([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(cuts.map((c) => Number(c.toFixed(9)))).toEqual([2.8, 4.6, 6.4, 8.2]);
    expect([1, 2.8, 5, 9, 10].map((v) => fifthOf(v, [2.8, 4.6, 6.4, 8.2]))).toEqual([0, 1, 2, 4, 4]);
  });

  test("memberFlags: only on days inside a membership window, from the start date", () => {
    const dates = ["2019-12-31", "2020-01-02", "2021-06-01", "2021-07-01"];
    expect(memberFlags(dates, [{ addedOn: "2019-01-01", removedOn: "2021-07-01" }], "2020-01-01")).toEqual([false, true, true, false]);
  });

  test("episodeStarts merges within 10 sessions", () => {
    const f = [true, ...Array(10).fill(false), true, ...Array(11).fill(false), true];
    expect(episodeStarts(f)).toEqual([0, 23]);
  });

  test("luckCheck is reproducible and spots a clearly better signal", () => {
    const pool = Array.from({ length: 500 }, (_, i) => i - 250);
    const a = luckCheck([200, 210, 220, 230, 240], pool);
    expect(a).toEqual(luckCheck([200, 210, 220, 230, 240], pool));
    expect(a!.direction).toBe("better");
    expect(a!.strength).toBeGreaterThan(99);
    expect(luckCheck([], pool)).toBeNull();
  });

  test("luckCheck: ties count half, so a flat pool is never 'unusual'", () => {
    const r = luckCheck([0, 0, 0], Array(100).fill(0));
    expect(r!.strength).toBe(50);
  });

  test("luckCheck: a signal that is just random days passes the 97.5 bar about 5% of the time", () => {
    const pool = Array.from({ length: 400 }, (_, i) => Math.sin(i * 12.9898) * 10);
    const rand = mulberry32(42);
    let passes = 0;
    const trials = 200;
    for (let t = 0; t < trials; t++) {
      const sample = Array.from({ length: 12 }, () => pool[Math.floor(rand() * pool.length)]!);
      if (luckCheck(sample, pool, 400, t + 1)!.strength >= LUCK_BAR) passes++;
    }
    expect(passes / trials).toBeGreaterThan(0.01);
    expect(passes / trials).toBeLessThan(0.11);
  });

  test("sameWay counts the other horizons on the main horizon's side of the baseline", () => {
    expect(sameWay([1, 2, 3, 4, 5], [0, 0, 0, 0, 0], 2)).toBe(4);
    expect(sameWay([1, -2, 3, null, 0], [0, 0, 0, 0, 0], 2)).toBe(1);
  });

  test("verdictOf", () => {
    const strong = { beat: 99, direction: "better" as const, strength: 99 };
    expect(verdictOf(40, 30, strong, 3)).toBe("Build");
    expect(verdictOf(10, 30, strong, 3)).toBe("Maybe"); // too few
    expect(verdictOf(40, 30, { beat: 90, direction: "better", strength: 90 }, 4)).toBe("Maybe");
    expect(verdictOf(40, 30, strong, 2)).toBe("Don't build");
    expect(verdictOf(0, 30, null, 0)).toBe("Don't build");
  });

  test("judge: no occasions gives — and Don't build, never throws", () => {
    const r = judge("x", "A", [], [[1], [1], [1], [1], [1]], 2, 8);
    expect(r).toMatchObject({ n: 0, months: 0, luck: null, verdict: "Don't build" });
    expect(r.medians).toEqual([null, null, null, null, null]);
  });

  test("distinctMonths", () => {
    expect(distinctMonths(["2020-03-02", "2020-03-20", "2022-06-16"])).toBe(2);
  });
});
