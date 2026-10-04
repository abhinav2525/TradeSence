import { test, expect, describe } from "bun:test";
import type { History } from "../src/indicators/history";
import { volumeSeries, volumeSignalFlags, CHART_HORIZONS, MARKET_SIGNALS } from "../src/research/volume-market";

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
    turnover: fill(2e7), factors: fill(1), shareFactors: fill(1), traded: fill(null), delivered: fill(null),
    ...over,
  } as History;
}
const arr = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => f(i));
const NO_CMF_CUTS = [Infinity, Infinity, Infinity, Infinity]; // nothing reaches the top fifth

describe("volumeSeries", () => {
  test("volume ratio against the previous 20 sessions, split-adjusted", () => {
    const n = 40;
    const volume = arr(n, (i) => (i < 25 ? 1000 : i === 30 ? 10000 : 2000));
    const shareFactors = arr(n, (i) => (i < 25 ? 2 : 1)); // 1:2 split on day 25
    const s = volumeSeries(hist(n, { volume, shareFactors, factors: shareFactors, close: arr(n, (i) => (i < 25 ? 200 : 100)) }));
    expect(s.volRatio[30]).toBeCloseTo(5, 9);
    expect(s.volRatio[26]).toBeCloseTo(1, 9);
  });

  test("returns start at the next session: the 1-session return is D+1 → D+2", () => {
    const s = volumeSeries(hist(40, { close: arr(40, (i) => 100 + i) }));
    expect(CHART_HORIZONS[0]).toBe(1);
    expect(s.returns[0]![20]).toBeCloseTo((122 / 121 - 1) * 100, 9);
  });

  test("no SMA 200 without 200 sessions in the segment", () => {
    expect(volumeSeries(hist(150)).sma200.every((v) => v === null)).toBe(true);
    expect(volumeSeries(hist(210)).sma200[205]).toBeCloseTo(100, 9);
  });

  test("the price move follows the page's gap rule", () => {
    const h = hist(40, { close: arr(40, (i) => (i === 30 ? 50 : 100)) });
    const base = new Date(`${h.dates[29]}T00:00:00Z`).getTime();
    h.dates = h.dates.map((x, i) => (i >= 30 ? new Date(base + (15 + i - 30) * 86_400_000).toISOString().slice(0, 10) : x));
    expect(volumeSeries(h).move[30]).toBeNull();
  });
});

describe("volumeSignalFlags", () => {
  test("six signals, in the spec's order", () => {
    expect(MARKET_SIGNALS).toHaveLength(6);
    expect(volumeSignalFlags(volumeSeries(hist(40)), NO_CMF_CUTS)).toHaveLength(6);
  });

  test("huge volume splits by the day's move; exactly 5× counts, 4.9× doesn't", () => {
    const up = volumeSeries(hist(40, { volume: arr(40, (i) => (i === 30 ? 5000 : 1000)), close: arr(40, (i) => (i >= 30 ? 103 : 100)) }));
    let f = volumeSignalFlags(up, NO_CMF_CUTS);
    expect([f[0]![30], f[1]![30]]).toEqual([true, false]);
    const down = volumeSeries(hist(40, { volume: arr(40, (i) => (i === 30 ? 5000 : 1000)), close: arr(40, (i) => (i >= 30 ? 97 : 100)) }));
    f = volumeSignalFlags(down, NO_CMF_CUTS);
    expect([f[0]![30], f[1]![30]]).toEqual([false, true]);
    const short = volumeSeries(hist(40, { volume: arr(40, (i) => (i === 30 ? 4900 : 1000)), close: arr(40, (i) => (i >= 30 ? 103 : 100)) }));
    expect(volumeSignalFlags(short, NO_CMF_CUTS)[0]![30]).toBe(false);
  });

  test("a huge-volume day with no valid move fires neither", () => {
    const h = hist(40, { volume: arr(40, (i) => (i === 30 ? 9000 : 1000)), close: arr(40, (i) => (i >= 30 ? 50 : 100)) });
    const base = new Date(`${h.dates[29]}T00:00:00Z`).getTime();
    h.dates = h.dates.map((x, i) => (i >= 30 ? new Date(base + (15 + i - 30) * 86_400_000).toISOString().slice(0, 10) : x));
    const f = volumeSignalFlags(volumeSeries(h), NO_CMF_CUTS);
    expect([f[0]![30], f[1]![30]]).toEqual([false, false]);
  });

  test("breakout above the 200-day average on 2× volume", () => {
    const n = 230;
    const close = arr(n, (i) => (i < 220 ? 100 : 110));
    const volume = arr(n, (i) => (i === 220 ? 2000 : 1000));
    const f = volumeSignalFlags(volumeSeries(hist(n, { close, volume, high: close.map((c) => c + 1), low: close.map((c) => c - 1) })), NO_CMF_CUTS);
    expect(f[2]![220]).toBe(true);
    expect(f[2]!.filter(Boolean)).toHaveLength(1);
  });

  test("illiquid days never fire", () => {
    const h = hist(40, { volume: arr(40, (i) => (i === 30 ? 9000 : 1000)), close: arr(40, (i) => (i >= 30 ? 103 : 100)), turnover: arr(40, () => 5e6) });
    expect(volumeSignalFlags(volumeSeries(h), NO_CMF_CUTS).flatMap((f) => f).some(Boolean)).toBe(false);
  });

  test("buyers in control: CMF at or above the top-fifth cut", () => {
    const s = volumeSeries(hist(40, { close: arr(40, () => 101) })); // closes at the high: CMF = +1
    const f = volumeSignalFlags(s, [-0.5, 0, 0.5, 0.9]);
    expect(f[4]![30]).toBe(true);
  });
});
