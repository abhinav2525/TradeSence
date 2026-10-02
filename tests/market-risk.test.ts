import { test, expect, describe } from "bun:test";
import { adjustedLine, type MovePoint } from "../src/indicators/risk";
import { ewmaVolatility, rangeHitRate, marketCapture } from "../src/indicators/market-risk";

const d = (i: number) => new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10);
const lineOf = (pcts: (number | null)[]) => adjustedLine(pcts.map((changePct, i) => ({ date: d(i), changePct })));
const movesOf = (pcts: (number | null)[]): MovePoint[] => pcts.map((changePct, i) => ({ date: d(i), changePct }));

describe("ewmaVolatility (RiskMetrics, λ = 0.94)", () => {
  test("seeds with the sample variance of the first 20 moves, then blends each squared move", () => {
    const alt = Array.from({ length: 20 }, (_, i) => (i % 2 ? -1 : 1));
    const s = ewmaVolatility(lineOf([null, ...alt, 2]));
    expect(s.slice(0, 20).every((x) => x === null)).toBe(true);
    expect(s[20]!).toBeCloseTo(Math.sqrt(20 / 19), 9); // mean 0, 20 squares of 1, ÷ 19
    expect(s[21]!).toBeCloseTo(Math.sqrt(0.94 * (20 / 19) + 0.06 * 4), 9);
  });
  test("RiskMetrics assumes a zero mean: a steady +0.5% a day reads as ±0.5%, and no moves as 0", () => {
    expect(ewmaVolatility(lineOf([null, ...Array(400).fill(0.5)])).at(-1)!).toBeCloseTo(0.5, 6);
    expect(ewmaVolatility(lineOf([null, ...Array(40).fill(0)])).at(-1)!).toBe(0);
  });
  test("doubling every move doubles σ", () => {
    const m = Array.from({ length: 60 }, (_, i) => ((i * 7) % 5) - 2);
    const a = ewmaVolatility(lineOf([null, ...m.map((x) => x * 0.5)])).at(-1)!;
    const b = ewmaVolatility(lineOf([null, ...m])).at(-1)!;
    expect(b / a).toBeCloseTo(2, 2); // ≈: compounding makes % moves not exactly linear
  });
  test("restarts after a gap: no σ until 20 new moves", () => {
    const pcts = [null, ...Array(30).fill(1), null, ...Array(10).fill(1)];
    const s = ewmaVolatility(lineOf(pcts));
    expect(s[30]).not.toBeNull();
    expect(s.slice(31).every((x) => x === null)).toBe(true);
  });
});

describe("rangeHitRate", () => {
  test("judges each week with the σ known at its start (no hindsight)", () => {
    const line = lineOf([null, 1, 1, 1, 1, 1]); // one 5-session stretch, about +5.1%
    // σ at the start says ±0.22% a week: outside. σ at the end (10) would have said inside.
    expect(rangeHitRate(line, [0.1, null, null, null, null, 10], 500, 1)).toEqual({ inside: 0, of: 1 });
  });
  test("uses only the last 500 sessions, and a flat line stays inside a zero range", () => {
    const line = lineOf([null, ...Array(599).fill(0)]);
    expect(rangeHitRate(line, ewmaVolatility(line))).toEqual({ inside: 495, of: 495 });
  });
  test("never measures a week across a gap, and needs 100 stretches", () => {
    const line = lineOf([null, ...Array(60).fill(0), null, ...Array(60).fill(0)]);
    const s = ewmaVolatility(line);
    // σ exists from index 20 (first segment) and 81 (second, after 20 new moves);
    // weeks must end in their own segment: starts 20..55 and 81..116
    expect(rangeHitRate(line, s, 500, 1)!.of).toBe(36 + 36);
    expect(rangeHitRate(line, s)).toBeNull();
  });
});

describe("marketCapture", () => {
  const m = (i: number) => (i === 0 ? null : ((i % 7) - 3) * 0.5); // includes flat days (0)
  const nifty = movesOf(Array.from({ length: 200 }, (_, i) => m(i)));
  test("a stock that moves exactly 2× the NIFTY: beta 2, capture 200% both ways", () => {
    const stock = movesOf(Array.from({ length: 200 }, (_, i) => (m(i) === null ? null : 2 * m(i)!)));
    const c = marketCapture(stock, nifty)!;
    expect(c.beta).toBeCloseTo(2, 9);
    expect(c.up).toBeCloseTo(200, 9);
    expect(c.down).toBeCloseTo(200, 9);
    expect(c.sessions).toBe(199);
  });
  test("the NIFTY against itself: beta 1, 100%", () => {
    expect(marketCapture(nifty, nifty)).toMatchObject({ beta: 1, up: 100, down: 100 });
  });
  test("matches by date: missing stock days are skipped, not shifted", () => {
    const stock = movesOf(Array.from({ length: 200 }, (_, i) => (m(i) === null ? null : 2 * m(i)!))).filter((_, i) => i % 3 !== 0);
    expect(marketCapture(stock, nifty)!.beta).toBeCloseTo(2, 9);
  });
  test("only the last 250 sessions count", () => {
    const n = movesOf(Array.from({ length: 400 }, (_, i) => m(i)));
    const s = movesOf(Array.from({ length: 400 }, (_, i) => (m(i) === null ? null : (i < 150 ? 3 : 2) * m(i)!)));
    expect(marketCapture(s, n)).toMatchObject({ sessions: 250 });
    expect(marketCapture(s, n)!.beta).toBeCloseTo(2, 9);
  });
  test("under 120 sessions: no answer", () => {
    expect(marketCapture(nifty.slice(0, 100), nifty)).toBeNull();
  });
});
