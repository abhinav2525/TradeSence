import { test, expect, describe } from "bun:test";
import type { History } from "../src/indicators/history";
import { windowMean, stockSeries, WINDOW, signalFlags, levelCutsByDate, occasionsOf, SIGNALS, matchedLuck, part, deliveryVerdict, type Occasion } from "../src/research/delivery";
import { mulberry32 } from "../src/research/volume";

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
describe("signalFlags", () => {
  // A hand-built series: 4 days, all eligible.
  const s = {
    dates: ["2021-01-04", "2021-01-05", "2021-01-06", "2021-01-07"],
    dp: [50, 50, 50, 50], rel: [30, -30, 30, 0], spike: [2.5, 1, 2, 3], level: [80, 20, 50, 50],
    move: [1, -1, -2, 0], eligible: [true, true, true, false], returns: [],
  };
  const relCuts = [-20, -5, 5, 20];
  const cuts = () => [30, 40, 60, 70];
  const f = signalFlags(s, relCuts, cuts);

  test("eight signals, in the spec's order", () => {
    expect(SIGNALS).toHaveLength(8);
    expect(f).toHaveLength(8);
  });
  test("high / low delivery against its own normal", () => {
    expect(f[0]).toEqual([true, false, true, false]);
    expect(f[1]).toEqual([false, true, false, false]);
  });
  test("accumulation needs a rise, distribution a fall", () => {
    expect(f[2]).toEqual([true, false, false, false]);
    expect(f[3]).toEqual([false, false, true, false]);
  });
  test("spike at exactly 2× counts; price direction splits it; ineligible days never fire", () => {
    expect(f[4]).toEqual([true, false, false, false]);
    expect(f[5]).toEqual([false, false, true, false]);
  });
  test("level fifths are cut across stocks on each day", () => {
    expect(f[6]).toEqual([true, false, false, false]);
    expect(f[7]).toEqual([false, true, false, false]);
  });
  test("a day with no level cuts fires neither level signal", () => {
    const g = signalFlags(s, relCuts, () => undefined);
    expect(g[6]!.some(Boolean) || g[7]!.some(Boolean)).toBe(false);
  });
});

describe("levelCutsByDate", () => {
  test("cuts each date's values into fifths; too few values gives no cuts", () => {
    const m = levelCutsByDate(new Map([["d1", [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]], ["d2", [1, 2]]]));
    expect(m.get("d1")).toHaveLength(4);
    expect(m.has("d2")).toBe(false);
  });
});

describe("occasionsOf", () => {
  test("one occasion per episode start, carrying its returns, day and pool position", () => {
    // Days 1 and 13 are 11 sessions apart (> MERGE_GAP 10): two episodes. Day 12 would merge.
    const flags = [true, true, false, false, false, false, false, false, false, false, false, false, false, true];
    const s = {
      dates: flags.map((_, i) => `2021-01-${String(i + 1).padStart(2, "0")}`),
      dp: [], rel: [], spike: [], level: [], move: [], eligible: [],
      returns: [flags.map((_, i) => i * 1.0)],
    };
    const occ = occasionsOf(flags, s, (d) => Number(d.slice(-2)), (i) => i + 100);
    expect(occ.map((o) => o.date)).toEqual(["2021-01-01", "2021-01-14"]);
    expect(occ[1]).toEqual({ date: "2021-01-14", day: 14, pos: 113, returns: [13] });
  });
});
const occ = (day: number, pos: number, ret: number): Occasion => ({ date: `2021-01-${String(day + 1).padStart(2, "0")}`, day, pos, returns: [ret] });

describe("matchedLuck", () => {
  test("a signal far above every other stock on its days is 'better' with strength 100", () => {
    const pools = [[0, 1, 2, 50], [0, 1, 2, 50]];
    const l = matchedLuck([occ(0, 3, 50), occ(1, 3, 50)], pools, 0, 200)!;
    expect(l.direction).toBe("better");
    expect(l.strength).toBe(100);
  });

  test("never draws the stock itself, and skips a day with no other stock", () => {
    // Day 0 holds only the signal stock; day 1 has one other stock at 0.
    const l = matchedLuck([occ(0, 0, 5), occ(1, 0, 5)], [[5], [5, 0]], 0, 50)!;
    expect(l.beat).toBe(100); // every draw is [0]: below 5
  });

  test("is reproducible for a seed", () => {
    const pools = [[1, 2, 3, 4, 5], [5, 4, 3, 2, 1]];
    const s = [occ(0, 2, 3), occ(1, 0, 5)];
    expect(matchedLuck(s, pools, 0, 300, 7)).toEqual(matchedLuck(s, pools, 0, 300, 7));
  });

  // Calibration: a "signal" that is just random stocks should pass the 97.5 bar ~5% of the time.
  test("random signals pass the two-sided 97.5 bar about 5% of the time", () => {
    const rand = mulberry32(42);
    const pools = Array.from({ length: 200 }, () => Array.from({ length: 30 }, () => rand() * 20 - 10));
    let passes = 0;
    const runs = 300;
    for (let r = 0; r < runs; r++) {
      const sig = Array.from({ length: 40 }, () => {
        const day = Math.floor(rand() * pools.length);
        const pos = Math.floor(rand() * 30);
        return occ(day, pos, pools[day]![pos]!);
      });
      if (matchedLuck(sig, pools, 0, 200, r + 1)!.strength >= 97.5) passes++;
    }
    expect(passes / runs).toBeGreaterThan(0.01);
    expect(passes / runs).toBeLessThan(0.1);
  });
});

describe("part and deliveryVerdict", () => {
  // Two horizons for brevity; main = 0.
  const mk = (n: number, med: number, base: number, beat: number, same = 1) => ({
    n, months: 12, medians: [med, med], baseline: [base, base],
    luck: { beat, direction: beat >= 50 ? "better" as const : "worse" as const, strength: Math.max(beat, 100 - beat) },
  });

  test("part: baseline is the median of the episode days' medians", () => {
    const pools = [[[1, 2, 3], [10, 20, 30]]];
    const dayMedians = [[2, 20]];
    const p = part([occ(0, 0, 1), occ(1, 0, 10)], pools, dayMedians, 0);
    expect(p.baseline[0]).toBe(11);
    expect(p.medians[0]).toBe(5.5);
    expect(p.n).toBe(2);
  });

  test("Build needs discovery and hold-out both", () => {
    const v = deliveryVerdict("x", mk(40, 2, 0, 99), mk(40, 1, 0, 96), 0);
    expect(v.verdict).toBe("Build");
  });

  test("a discovery pass that the hold-out doesn't confirm is only Maybe", () => {
    expect(deliveryVerdict("x", mk(40, 2, 0, 99), mk(40, 1, 0, 80), 0).verdict).toBe("Maybe");
    expect(deliveryVerdict("x", mk(40, 2, 0, 99), mk(20, 1, 0, 99), 0).verdict).toBe("Maybe");
  });

  test("an effect under 0.5 points can't Build, however unusual", () => {
    expect(deliveryVerdict("x", mk(40, 0.3, 0, 100), mk(40, 0.3, 0, 100), 0).verdict).toBe("Maybe");
  });

  test("a 'worse' signal is confirmed by a hold-out beat of 5 or less", () => {
    expect(deliveryVerdict("x", mk(40, -2, 0, 1), mk(40, -1, 0, 4), 0).verdict).toBe("Build");
    expect(deliveryVerdict("x", mk(40, -2, 0, 1), mk(40, -1, 0, 96), 0).verdict).toBe("Maybe");
  });
});
