import { test, expect, describe } from "bun:test";
import { adjustedLine, drawdownSeries, worstDrawdown, currentDrawdownPct, closesToMoves } from "../src/indicators/risk";
import {
  horizonStats, periodReturn, dailyVolatility, percentRank,
  trendLight, strengthLight, ratioLight, liquidityLight, HORIZONS,
} from "../src/indicators/risk";

const d = (i: number) => new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10);
const moves = (pcts: (number | null)[]) => pcts.map((changePct, i) => ({ date: d(i), changePct }));

describe("adjustedLine", () => {
  test("chains daily moves from 100", () => {
    const line = adjustedLine(moves([null, 10, -10]));
    [100, 110, 99].forEach((v, i) => expect(line[i]!.level).toBeCloseTo(v, 9));
    expect(line.map((p) => p.segment)).toEqual([0, 0, 0]);
  });

  test("a missing move starts a new segment and keeps the level", () => {
    const line = adjustedLine(moves([null, 10, null, 10]));
    expect(line.map((p) => p.segment)).toEqual([0, 0, 1, 1]);
    expect(line[2]!.level).toBeCloseTo(110, 9);
    expect(line[3]!.level).toBeCloseTo(121, 9);
  });
});

describe("drawdowns", () => {
  test("worst fall with peak, trough and recovery", () => {
    // 100 → 120 (peak) → 60 (−50%) → 120 again (recovered)
    const line = adjustedLine(moves([null, 20, -25, -33.3333333333, 100]));
    const w = worstDrawdown(line)!;
    expect(w.depthPct).toBeCloseTo(-50, 6);
    expect(w).toMatchObject({ peakDate: d(1), troughDate: d(3), recoveryDate: d(4), sessionsToRecover: 3 });
  });

  test("not recovered yet", () => {
    const w = worstDrawdown(adjustedLine(moves([null, 20, -50])))!;
    expect(w).toMatchObject({ recoveryDate: null, sessionsToRecover: null });
    expect(currentDrawdownPct(adjustedLine(moves([null, 20, -50])))!).toBeCloseTo(-50, 9);
  });

  test("the running peak resets at a segment break", () => {
    const s = drawdownSeries(adjustedLine(moves([null, 50, null, -10])));
    expect(s.map((p) => Math.round(p.pct))).toEqual([0, 0, 0, -10]);
  });

  test("no history, no drawdown", () => {
    expect(worstDrawdown([])).toBeNull();
  });
});

test("closesToMoves turns index closes into daily moves", () => {
  const m = closesToMoves([{ date: d(0), close: 100 }, { date: d(1), close: 105 }]);
  expect(m[0]).toEqual({ date: d(0), changePct: null });
  expect(m[1]!.changePct!).toBeCloseTo(5, 9);
});


describe("horizonStats", () => {
  test("rolling windows: 10th percentile, worst, share negative, median", () => {
    // 30 sessions alternating +1% / −1%: every 2-session window is ≈ −0.01%
    const pts = Array.from({ length: 30 }, (_, i) => (i === 0 ? null : i % 2 ? 1 : -1));
    const s = horizonStats(adjustedLine(moves(pts)), 2)!;
    expect(s.windows).toBe(28);
    expect(s.shareNegative).toBe(100);
    expect(s.worst).toBeCloseTo(-0.01, 4);
    expect(s.bins.reduce((n, b) => n + b.count, 0)).toBe(28);
  });

  test("needs at least three horizons of history", () => {
    expect(horizonStats(adjustedLine(moves(new Array(14).fill(1))), 5)).toBeNull();
    expect(horizonStats(adjustedLine(moves(new Array(15).fill(1))), 5)).not.toBeNull();
  });

  test("a window never spans a segment break", () => {
    const pts = [null, 10, 10, null, 10, 10];
    const s = horizonStats(adjustedLine(moves([...pts, ...pts])), 2)!;
    expect(s.worst).toBeCloseTo(21, 6); // only same-segment windows (two +10% days)
  });

  test("HORIZONS are the agreed session counts", () => {
    expect(HORIZONS).toEqual({ "1w": 5, "1m": 21, "3m": 63, "1y": 250 });
  });
});

test("periodReturn", () => {
  const line = adjustedLine(moves([null, 10, 10]));
  expect(periodReturn(line, 2)!).toBeCloseTo(21, 9);
  expect(periodReturn(line, 5)).toBeNull();
});

test("dailyVolatility needs 60 moves and uses the last 250", () => {
  expect(dailyVolatility(new Array(59).fill(1))).toBeNull();
  const v = dailyVolatility([...new Array(300).fill(10), ...Array.from({ length: 250 }, (_, i) => (i % 2 ? 1 : -1))])!;
  expect(v).toBeCloseTo(1.002, 3); // the old ±10s are outside the window
});

test("percentRank", () => {
  expect(percentRank(3, [1, 2, 3, 4])).toBe(75);
});

describe("lights", () => {
  test("trend", () => {
    expect(trendLight(110, 100, 100)).toBe("green");
    expect(trendLight(110, 120, 100)).toBe("amber");
    expect(trendLight(90, 100, 100)).toBe("red");
    expect(trendLight(90, null, 100)).toBeNull();
  });
  test("strength boundaries", () => {
    expect([67, 66, 34, 33].map(strengthLight)).toEqual(["green", "amber", "amber", "red"]);
  });
  test("ratio boundaries (bumpiness, worst fall)", () => {
    expect([1.2, 1.21, 1.8, 1.81].map(ratioLight)).toEqual(["green", "amber", "amber", "red"]);
  });
  test("liquidity boundaries in ₹ crore", () => {
    expect([100, 99.9, 10, 9.9].map(liquidityLight)).toEqual(["green", "amber", "amber", "red"]);
  });
});
