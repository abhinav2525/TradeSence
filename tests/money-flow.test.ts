import { test, expect, describe } from "bun:test";
import type { History } from "../src/indicators/history";
import {
  MIN_NORMAL, NORMAL_SESSIONS, cleanFlowPeriod, flowStats, flowWindows, sectorFlows, sectorStocks, type FlowRow,
} from "../src/indicators/money-flow";

/** n weekday sessions from 2026-01-01; `over` replaces whole columns. */
function hist(n: number, over: Partial<Record<keyof History, unknown[]>> = {}): History {
  const dates: string[] = [];
  const d = new Date("2026-01-01T00:00:00Z");
  while (dates.length < n) {
    if (d.getUTCDay() % 6 !== 0) dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const fill = <T,>(v: T) => dates.map(() => v);
  return {
    dates, open: fill(100), high: fill(101), low: fill(99), close: fill(100), volume: fill(1000),
    turnover: fill(1e7), factors: fill(1), shareFactors: fill(1), traded: fill(null), delivered: fill(null), ...over,
  } as History;
}
const newestFirst = (h: History) => [...h.dates].reverse();

describe("flowWindows", () => {
  test("window = last P sessions; normal = the 63 before it, never overlapping", () => {
    const h = hist(100);
    const days = newestFirst(h);
    const w = flowWindows(days)!;
    expect(w.asOf).toBe(days[0]);
    expect(w.starts[5]).toBe(days[4]);
    expect(w.normalTo[5]).toBe(days[5]);
    expect(w.normalFrom[5]).toBe(days[5 + NORMAL_SESSIONS - 1]);
    expect(w.normalTo[5] < w.starts[5]).toBe(true);
  });
  test("too few sessions for the longest window plus its normal: null", () => {
    expect(flowWindows(newestFirst(hist(21 + NORMAL_SESSIONS - 1)))).toBeNull();
    expect(flowWindows(newestFirst(hist(21 + NORMAL_SESSIONS)))).not.toBeNull();
  });
});

describe("flowStats", () => {
  test("turnover over the window, normal = mean per traded session before it", () => {
    // last 5 sessions trade ₹3 cr a day, everything before ₹1 cr
    const h = hist(100, { turnover: Array.from({ length: 100 }, (_, i) => (i >= 95 ? 3e7 : 1e7)) });
    const s = flowStats(h, flowWindows(newestFirst(h))!).find((x) => x.period === 5)!;
    expect(s.turnover).toBe(15e7);
    expect(s.normalDaily).toBe(1e7);
    expect(s.sessions).toBe(5);
  });
  test(`a normal needs ${MIN_NORMAL} traded sessions of the 63`, () => {
    const full = hist(100);
    const w = flowWindows(newestFirst(full))!;
    // keep the last 5 + only 39 (then 40) sessions of the normal window
    const keep = (k: number) => {
      const idx = [...Array.from({ length: k }, (_, j) => 94 - j), 95, 96, 97, 98, 99].sort((a, b) => a - b);
      const pick = <T,>(a: T[]) => idx.map((i) => a[i]!);
      return { ...full, dates: pick(full.dates), open: pick(full.open), high: pick(full.high), low: pick(full.low), close: pick(full.close),
        volume: pick(full.volume), turnover: pick(full.turnover), factors: pick(full.factors), shareFactors: pick(full.shareFactors),
        traded: pick(full.traded), delivered: pick(full.delivered) } as History;
    };
    expect(flowStats(keep(MIN_NORMAL - 1), w).find((x) => x.period === 5)!.normalDaily).toBeNull();
    expect(flowStats(keep(MIN_NORMAL), w).find((x) => x.period === 5)!.normalDaily).toBe(1e7);
  });
  test("price move on adjusted closes; none if the stock missed the latest session", () => {
    const close = Array.from({ length: 100 }, (_, i) => (i >= 95 ? 220 : 100));
    const factors = Array.from({ length: 100 }, (_, i) => (i >= 95 ? 1 : 0.5)); // a 2:1 consolidation before the window
    const h = hist(100, { close, factors });
    const w = flowWindows(newestFirst(h))!;
    expect(flowStats(h, w).find((x) => x.period === 5)!.changePct).toBeCloseTo(10, 9); // 200 adjusted → 220
    const missed = { ...h, dates: h.dates.slice(0, 99), close: close.slice(0, 99), factors: factors.slice(0, 99), turnover: h.turnover.slice(0, 99) } as History;
    expect(flowStats(missed, w).find((x) => x.period === 5)!.changePct).toBeNull();
  });
});

const row = (symbol: string, sector: string, turnover: number, normalDaily: number | null, changePct: number | null): FlowRow =>
  ({ symbol, sector, turnover, normalDaily, changePct });

describe("sectorFlows", () => {
  const rows: FlowRow[] = [
    ...["A", "B", "C", "D", "E"].map((s, i) => row(s, "Metals", 20e7, 2e7, i < 3 ? 2 : -1)), // 2× normal over 5 sessions
    row("F", "Metals", 5e7, null, 4), // new listing: share yes, ratio no
    ...["G", "H", "I", "J", "K"].map((s) => row(s, "IT", 5e7, 2e7, -3)), // 0.5×
    ...["L", "M", "N", "O"].map((s) => row(s, "Utilities", 1e7, 1e6, 0)), // under 5 stocks
  ];
  const { sectors, small } = sectorFlows(rows, 5);
  test("ratio over stocks with a normal; sorted busiest first", () => {
    expect(sectors.map((x) => x.sector)).toEqual(["Metals", "IT"]);
    expect(sectors[0]!.ratio).toBeCloseTo(100e7 / 50e7, 12);
    expect(sectors[1]!.ratio).toBeCloseTo(0.5, 12);
  });
  test("share of all trading (small sectors count in the total) vs usual", () => {
    const total = 105e7 + 25e7 + 4e7;
    expect(sectors[0]!.share).toBeCloseTo(105e7 / total, 12);
    expect(sectors[0]!.usualShare).toBeCloseTo(10e7 / (10e7 + 10e7 + 4e6), 12);
  });
  test("median move and rising/falling counts", () => {
    expect(sectors[0]!.medianMove).toBe(2);
    expect([sectors[0]!.up, sectors[0]!.down]).toEqual([4, 2]);
  });
  test("sectors under 5 stocks are named, not drawn", () => {
    expect(small).toEqual(["Utilities"]);
  });
  test("a sector with no normals has no ratio, sorts last, never NaN", () => {
    const r = sectorFlows([...rows, ...["P", "Q", "R", "S", "T"].map((s) => row(s, "Power", 1e7, null, 1))], 5).sectors;
    expect(r.at(-1)!.sector).toBe("Power");
    expect(r.at(-1)!.ratio).toBeNull();
  });
});

describe("sectorStocks", () => {
  test("stocks by extra ₹ above their normal; no normal sorts last", () => {
    const rows = [row("A", "IT", 20e7, 2e7, 1), row("B", "IT", 30e7, 1e7, 1), row("C", "IT", 50e7, null, 1), row("D", "Metals", 99e7, 1e7, 1)];
    const r = sectorStocks(rows, "IT", 5);
    expect(r.map((x) => x.symbol)).toEqual(["B", "A", "C"]);
    expect(r[0]!.extra).toBe(25e7);
    expect(r[0]!.ratio).toBe(6);
    expect(r[2]!.extra).toBeNull();
    expect(sectorStocks(rows, "IT", 5, 1).length).toBe(1);
  });
});

describe("cleanFlowPeriod", () => {
  test("1, 5, 21 accepted; anything else is 1 week", () => {
    expect([cleanFlowPeriod("1"), cleanFlowPeriod("21"), cleanFlowPeriod("5")]).toEqual([1, 21, 5]);
    for (const v of [undefined, "", "63", "5;drop", " 1", "21.0"]) expect(cleanFlowPeriod(v)).toBe(5);
  });
});
