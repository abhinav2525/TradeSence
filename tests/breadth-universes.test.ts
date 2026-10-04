import { test, expect, describe } from "bun:test";
import type { History } from "../src/indicators/history";
import { adjustedAverages } from "../src/indicators/averages";
import { sma, ema } from "../src/indicators/moving-average";
import { addStock, newCounts, cleanUniverse } from "../src/indicators/breadth-universes";

function hist(dates: string[], close: number[], factors?: number[]): History {
  const fill = <T,>(v: T) => dates.map(() => v);
  return { dates, open: close, high: close, low: close, close, volume: fill(1000), turnover: fill(2e7),
    factors: factors ?? fill(1), shareFactors: fill(1), traded: fill(null), delivered: fill(null) } as History;
}
function weekdays(from: string, n: number): string[] {
  const out: string[] = []; const d = new Date(`${from}T00:00:00Z`);
  while (out.length < n) { if (d.getUTCDay() % 6 !== 0) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}

describe("adjustedAverages", () => {
  test("SMA/EMA on adjusted closes, restarting after a gap over 21 days", () => {
    const a = weekdays("2024-01-01", 210), b = weekdays("2024-12-01", 60); // a 2+ month hole between
    const dates = [...a, ...b];
    const close = dates.map((_, i) => 100 + (i % 7));
    const factors = dates.map((_, i) => (i < 100 ? 2 : 1)); // a 1:2 consolidation-like step: adjusted = close / factor
    const r = adjustedAverages(hist(dates, close, factors));
    const adj = close.map((c, i) => c / factors[i]!);
    expect(r.adjusted).toEqual(adj);
    const segA = adj.slice(0, 210);
    expect(r.sma200.slice(0, 210)).toEqual(sma(segA, 200));
    expect(r.ema200.slice(0, 210)).toEqual(ema(segA, 200));
    expect(r.sma50[210 + 48]).toBeNull(); // the second stretch starts its own window
    expect(r.sma50[210 + 49]).toBeCloseTo(adj.slice(210 + 0, 210 + 50).reduce((s, v) => s + v, 0) / 50, 9);
  });
});

describe("breadth counter", () => {
  const dates = ["2026-01-01", "2026-01-02", "2026-01-05"];
  const stock = (adjusted: number[], ma: (number | null)[]) => ({ dates, adjusted, sma50: ma, sma200: ma, ema200: ma });
  test("above/total per day; a null average is left out, not 'below'", () => {
    const c = newCounts();
    addStock(c, stock([10, 10, 10], [9, 11, null]), [true, true, true]);
    addStock(c, stock([10, 10, 10], [11, 9, 9]), [true, true, true]);
    expect(c.get("2026-01-01")!.sma200).toEqual({ above: 1, total: 2 });
    expect(c.get("2026-01-02")!.sma200).toEqual({ above: 1, total: 2 });
    expect(c.get("2026-01-05")!.sma200).toEqual({ above: 1, total: 1 });
  });
  test("close equal to the average is not above", () => {
    const c = newCounts();
    addStock(c, stock([10, 10, 10], [10, 10, 10]), [true, true, true]);
    expect(c.get("2026-01-01")!.sma50).toEqual({ above: 0, total: 1 });
  });
  test("the include mask (liquidity) and latest-only counting", () => {
    const c = newCounts();
    addStock(c, stock([10, 10, 10], [9, 9, 9]), [false, true, true]);
    expect(c.has("2026-01-01")).toBe(false);
    const latest = newCounts();
    addStock(latest, stock([10, 10, 10], [9, 9, 9]), [true, true, true], "2026-01-05");
    expect([...latest.keys()]).toEqual(["2026-01-05"]);
  });
  test("a stock that didn't trade on the latest day adds nothing to a list's count", () => {
    const latest = newCounts();
    addStock(latest, { dates: dates.slice(0, 2), adjusted: [10, 10], sma50: [9, 9], sma200: [9, 9], ema200: [9, 9] }, [true, true], "2026-01-05");
    expect(latest.size).toBe(0);
  });
});

describe("cleanUniverse", () => {
  test("nifty50, market and index-list keys (not nifty-50); anything else is nifty50", () => {
    expect(cleanUniverse("market")).toBe("market");
    expect(cleanUniverse("midcap-150")).toBe("midcap-150");
    expect(cleanUniverse("total-market")).toBe("total-market");
    for (const v of [undefined, "", "nifty-50", "MARKET", "bank;drop", "x"]) expect(cleanUniverse(v)).toBe("nifty50");
  });
});
