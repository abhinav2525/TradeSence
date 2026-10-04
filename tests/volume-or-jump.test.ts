import { test, expect, describe } from "bun:test";
import { bandOf, thirdCuts, thirdOf, groupKey, ols, neweyWest, verdict5, Q1_BANDS, Q2_BANDS } from "../src/research/volume-or-jump";
import { mulberry32 } from "../src/research/volume";
import { matchedLuck } from "../src/research/delivery";
import { droppedCount, jumpFlags, breakoutFlags, medianTurnover, prevReturn, normalEq, addRow, solveEq } from "../src/research/volume-or-jump";

describe("bands, thirds, groups", () => {
  test("Q1 bands start at +3%, exactly 3 counts", () => {
    expect(bandOf(2.99, Q1_BANDS, 3)).toBeNull();
    expect(bandOf(3, Q1_BANDS, 3)).toBe(0);
    expect(bandOf(5, Q1_BANDS, 3)).toBe(1);
    expect(bandOf(11.9, Q1_BANDS, 3)).toBe(2);
    expect(bandOf(40, Q1_BANDS, 3)).toBe(3);
    expect(bandOf(null, Q1_BANDS, 3)).toBeNull();
  });
  test("Q2 bands cover small moves too", () => {
    expect(bandOf(0.4, Q2_BANDS, null)).toBe(0);
    expect(bandOf(2, Q2_BANDS, null)).toBe(1);
    expect(bandOf(9, Q2_BANDS, null)).toBe(4);
  });
  test("size thirds by rank that day", () => {
    const cuts = thirdCuts([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect([thirdOf(1, cuts), thirdOf(5, cuts), thirdOf(9, cuts)]).toEqual([0, 1, 2]);
  });
  test("group key: month, band, third (+ sector)", () => {
    expect(groupKey("2021-03-15", 2, 1)).toBe("2021-03|2|1");
    expect(groupKey("2021-03-15", 2, 1, "Capital Goods")).toBe("2021-03|2|1|Capital Goods");
  });
});

describe("ols", () => {
  test("recovers known coefficients", () => {
    const rand = mulberry32(3);
    const X: number[][] = [], y: number[] = [];
    for (let i = 0; i < 500; i++) {
      const a = rand(), b = rand();
      X.push([1, a, b]); y.push(2 - 3 * a + 0.5 * b + (rand() - 0.5) * 1e-6);
    }
    const c = ols(X, y)!;
    expect(c[0]).toBeCloseTo(2, 4); expect(c[1]).toBeCloseTo(-3, 4); expect(c[2]).toBeCloseTo(0.5, 4);
  });
  test("a singular design returns null, never NaN", () => {
    expect(ols([[1, 2], [1, 2], [1, 2]], [1, 2, 3])).toBeNull();
  });
});

describe("neweyWest", () => {
  test("lag 0 equals the ordinary t of a mean", () => {
    const s = [1, 2, 3, 4, 5];
    const r = neweyWest(s, 0)!;
    const sd = Math.sqrt(s.reduce((a, v) => a + (v - 3) ** 2, 0) / s.length);
    expect(r.mean).toBe(3);
    expect(r.se).toBeCloseTo(sd / Math.sqrt(5), 9);
  });
  test("positive autocorrelation widens the error", () => {
    const s = Array.from({ length: 200 }, (_, i) => (Math.floor(i / 20) % 2 ? 1 : -1) + 0.1);
    expect(neweyWest(s, 20)!.se).toBeGreaterThan(neweyWest(s, 0)!.se);
  });
  test("too short a series: null", () => {
    expect(neweyWest([1, 2], 20)).toBeNull();
  });
});

describe("verdict5", () => {
  const part = (n: number, med: number, base: number, beat: number) => ({
    n, months: 12, medians: [med, med, med, med, med], baseline: [base, base, base, base, base],
    luck: { beat, direction: beat >= 50 ? "better" as const : "worse" as const, strength: Math.max(beat, 100 - beat) },
  });
  test("Volume adds: both methods, both periods", () => {
    expect(verdict5({ disc: part(50, -1, 0, 1), hold: part(40, -0.8, 0, 3), main: 2, fmT: -3.5, fmB: -0.2, needFm: true })).toBe("Volume adds");
  });
  test("a weak regression keeps it Not settled", () => {
    expect(verdict5({ disc: part(50, -1, 0, 1), hold: part(40, -0.8, 0, 3), main: 2, fmT: -2.1, fmB: -0.2, needFm: true })).toBe("Not settled");
  });
  test("The jump explains it: under 0.3 pts in both periods", () => {
    expect(verdict5({ disc: part(50, -0.1, 0, 30), hold: part(40, 0.2, 0, 60), main: 2, fmT: -1, fmB: -0.01, needFm: true })).toBe("The jump explains it");
  });
  test("one-method question ignores the regression", () => {
    expect(verdict5({ disc: part(50, -1, 0, 1), hold: part(40, -0.8, 0, 3), main: 2, fmT: null, fmB: null, needFm: false })).toBe("Volume adds");
  });
});

describe("matched groups", () => {
  const occ = (day: number, r: number) => ({ date: "2021-03-15", day, pos: -1, returns: [r, r, r, r, r] });
  test("a signal whose group has no control is dropped and counted", () => {
    const pools = [[1, 2], []];
    expect(droppedCount([occ(0, 5), occ(1, 5), occ(1, 6)], pools)).toBe(2);
  });
  test("the luck check draws only from the signal's own group", () => {
    // group 0 controls all +10, group 1 all −10: a signal of 0 in group 0 loses every draw
    const pools = [[10, 10, 10], [-10, -10, -10]];
    const l = matchedLuck([occ(0, 0), occ(0, 0), occ(0, 0)], pools, 0)!;
    expect(l.beat).toBe(0);
  });
});

describe("signal and control flags", () => {
  // a minimal series: day 1 crosses above the average; volume ratio and move vary per test
  const series = (volRatio: number | null, move: number | null) => ({
    dates: ["2021-03-01", "2021-03-02"], close: [99, 101], sma200: [100, 100],
    volRatio: [1, volRatio], move: [0, move], eligible: [true, true],
  });
  test("Q1: exactly 5× and exactly +3% are a signal; a float hair under 5× still counts", () => {
    expect(jumpFlags(series(5, 3)).signal[1]).toBe(true);
    expect(jumpFlags(series(4.999999999999999, 3)).signal[1]).toBe(true);
    expect(jumpFlags(series(5, 2.9)).signal[1]).toBe(false);
  });
  test("Q1: control needs the same +3% jump on under 1.5×", () => {
    expect(jumpFlags(series(1.2, 4)).control[1]).toBe(true);
    expect(jumpFlags(series(1.5, 4)).control[1]).toBe(false);
    expect(jumpFlags(series(1.2, 2)).control[1]).toBe(false);
  });
  test("Q2: exactly 2× on a cross is a signal; under 1.5× a control; not eligible neither", () => {
    expect(breakoutFlags(series(2, 2)).signal[1]).toBe(true);
    expect(breakoutFlags(series(1.9999999999999998, 2)).signal[1]).toBe(true);
    expect(breakoutFlags(series(1.4, 2)).control[1]).toBe(true);
    expect(breakoutFlags({ ...series(3, 2), eligible: [true, false] }).signal[1]).toBe(false);
  });
});

describe("size and reversal inputs", () => {
  test("median turnover of the last 20 sessions, null before 20", () => {
    const dates = Array.from({ length: 21 }, (_, i) => `2021-03-${String(i + 1).padStart(2, "0")}`);
    const t = dates.map((_, i) => i + 1);
    const m = medianTurnover(t, dates);
    expect(m[18]).toBeNull();
    expect(m[19]).toBe(10.5);
    expect(m[20]).toBe(11.5);
  });
  test("previous-21-session return ends the day before, null without 22 sessions", () => {
    const dates = Array.from({ length: 23 }, (_, i) => `2021-03-${String(i + 1).padStart(2, "0")}`);
    const close = dates.map((_, i) => 100 + i);
    const r = prevReturn(close, dates, 21);
    expect(r[21]).toBeNull();
    expect(r[22]).toBeCloseTo((121 / 100 - 1) * 100, 9);
  });
});

describe("normal equations, row by row", () => {
  test("same answer as ols on the whole matrix", () => {
    const rand = mulberry32(9);
    const X: number[][] = [], y: number[] = [];
    const acc = normalEq(3);
    for (let i = 0; i < 300; i++) {
      const x = [1, rand(), rand() * 20];
      const v = 1 + 2 * x[1]! - 0.1 * x[2]! + rand();
      X.push(x); y.push(v); addRow(acc, x, v);
    }
    const a = ols(X, y)!, b = solveEq(acc)!;
    a.forEach((v, i) => expect(b[i]).toBeCloseTo(v, 9));
    expect(acc.n).toBe(300);
  });
});
