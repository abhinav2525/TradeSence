import { test, expect, describe } from "bun:test";
import { adjustedLine, drawdownSeries, worstDrawdown, currentDrawdownPct, closesToMoves } from "../src/indicators/risk";

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
