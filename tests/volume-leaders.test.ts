import { test, expect, describe, beforeEach } from "bun:test";
import type { History } from "../src/indicators/history";
import { leaderStats, PERIODS } from "../src/indicators/volume-leaders";
import { db, schema } from "../src/db";
import { computeVolumeLeaders } from "../src/indicators/compute-volume-leaders";

function hist(n: number, over: Partial<Record<keyof History, unknown[]>> = {}): History {
  const dates: string[] = [];
  const d = new Date("2026-03-02T00:00:00Z");
  while (dates.length < n) {
    if (d.getUTCDay() % 6 !== 0) dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const fill = <T,>(v: T) => dates.map(() => v);
  return {
    dates, open: fill(100), high: fill(101), low: fill(99), close: fill(100), volume: fill(1000),
    turnover: fill(1e5), factors: fill(1), shareFactors: fill(1), traded: fill(null), delivered: fill(null), ...over,
  } as History;
}
const starts = (h: History) => Object.fromEntries(PERIODS.map((p) => [p, h.dates[h.dates.length - p]!])) as Record<(typeof PERIODS)[number], string>;

describe("leaderStats", () => {
  test("sums turnover and shares over each window", () => {
    const h = hist(200);
    const s = leaderStats(h, starts(h), h.dates.at(-1)!);
    expect(s.find((x) => x.period === 5)).toMatchObject({ turnover: 5e5, shares: 5000, sessions: 5 });
    expect(s.find((x) => x.period === 126)).toMatchObject({ turnover: 126e5, shares: 126000, sessions: 126 });
  });

  test("a 1:5 split inside the window doesn't inflate shares", () => {
    const n = 200, cut = 150;
    const h = hist(n, {
      volume: Array.from({ length: n }, (_, i) => (i < cut ? 1000 : 5000)),
      shareFactors: Array.from({ length: n }, (_, i) => (i < cut ? 5 : 1)),
      factors: Array.from({ length: n }, (_, i) => (i < cut ? 5 : 1)),
      close: Array.from({ length: n }, (_, i) => (i < cut ? 500 : 100)),
    });
    expect(leaderStats(h, starts(h), h.dates.at(-1)!).find((x) => x.period === 126)!.shares).toBe(126 * 5000);
  });

  test("price move: adjusted close at the end vs the last close before the window", () => {
    const h = hist(200, { close: Array.from({ length: 200 }, (_, i) => (i < 195 ? 100 : 110)) });
    expect(leaderStats(h, starts(h), h.dates.at(-1)!).find((x) => x.period === 5)!.changePct).toBeCloseTo(10, 9);
  });

  test("a short history counts only the sessions it has", () => {
    const h = hist(10);
    const allStarts = Object.fromEntries(PERIODS.map((p) => [p, "2025-01-01"])) as Record<(typeof PERIODS)[number], string>;
    const s = leaderStats(h, allStarts, h.dates.at(-1)!).find((x) => x.period === 126)!;
    expect(s.sessions).toBe(10);
    expect(s.changePct).toBeNull(); // nothing before the window to compare with
  });

  test("a stock that didn't trade in the window gets no row", () => {
    const h = hist(50);
    const later = Object.fromEntries(PERIODS.map((p) => [p, "2027-01-01"])) as Record<(typeof PERIODS)[number], string>;
    expect(leaderStats(h, later, "2027-01-08")).toEqual([]);
  });
});

describe("computeVolumeLeaders", () => {
  beforeEach(async () => {
    for (const t of [schema.dailyPrices, schema.ingestLog, schema.volumeLeaders, schema.unusualDays, schema.indexConstituents]) await db.delete(t);
  });
  test("writes five periods per universe stock, counting unusual days, and replaces on re-run", async () => {
    const days = hist(10).dates;
    await db.insert(schema.ingestLog).values(days.map((d) => ({ tradeDate: d, source: "bhavcopy", status: "ok", format: "udiff", rowCount: 1 })));
    await db.insert(schema.dailyPrices).values(days.map((d) => ({ tradeDate: d, symbol: "ABC", series: "EQ", open: 1, high: 1, low: 1, close: 1, prevClose: 1, volume: 10, turnover: 100 })));
    await db.insert(schema.indexConstituents).values({ indexKey: "total-market", symbol: "ABC", industry: "Capital Goods", fetchedOn: days.at(-1)! });
    await db.insert(schema.unusualDays).values({ tradeDate: days.at(-1)!, symbol: "ABC", kept: false, volume: true, jump: false, collapse: false, keptRatio: null, volumeRatio: 6, deliveryPct: null, usualDeliveryPct: null, changePct: 0, turnover: 100 });
    await computeVolumeLeaders();
    await computeVolumeLeaders();
    const rows = await db.select().from(schema.volumeLeaders);
    expect(rows).toHaveLength(5);
    expect(rows.find((r) => r.period === 5)).toMatchObject({ turnover: 500, unusualDays: 1, sessions: 5, asOf: days.at(-1) });
  });
});

// ── final-review fixes ──
describe("leaderStats, price-move guards", () => {
  test("no price move when the stock's last trade isn't the latest session", () => {
    const h = hist(200);
    const s = starts(h);
    const later = "2027-01-15"; // the market's latest session, after this stock stopped trading
    expect(leaderStats(h, s, later).find((x) => x.period === 126)!.changePct).toBeNull();
  });

  // HEGAM, 22 Sep 2026: EQ, a stretch outside EQ around an unpriced demerger, EQ again: "−68%".
  test("no price move across a gap of more than 5 calendar days inside the window", () => {
    const h = hist(200, { close: Array.from({ length: 200 }, (_, i) => (i < 190 ? 728 : 233)) });
    const base = new Date(`${h.dates[189]}T00:00:00Z`).getTime();
    h.dates = h.dates.map((d, i) => (i >= 190 ? new Date(base + (17 + i - 190) * 86_400_000).toISOString().slice(0, 10) : d));
    const s = Object.fromEntries(PERIODS.map((p) => [p, h.dates[h.dates.length - p]!])) as Record<(typeof PERIODS)[number], string>;
    const st = leaderStats(h, s, h.dates.at(-1)!);
    expect(st.find((x) => x.period === 21)!.changePct).toBeNull();
    expect(st.find((x) => x.period === 5)!.changePct).toBeCloseTo(0, 9); // a window after the gap is fine
  });
});

describe("computeVolumeLeaders, review fixes", () => {
  beforeEach(async () => {
    for (const t of [schema.dailyPrices, schema.ingestLog, schema.volumeLeaders, schema.unusualDays, schema.indexConstituents]) await db.delete(t);
  });
  test("counts trade-for-trade (BE) days, and a universe stock with no prices gets no row", async () => {
    const days = hist(10).dates;
    await db.insert(schema.ingestLog).values(days.map((d) => ({ tradeDate: d, source: "bhavcopy", status: "ok", format: "udiff", rowCount: 1 })));
    await db.insert(schema.dailyPrices).values(days.map((d, i) => ({
      tradeDate: d, symbol: "ABC", series: i >= 7 ? "BE" : "EQ", open: 1, high: 1, low: 1, close: 1, prevClose: 1, volume: 10, turnover: 100,
    })));
    await db.insert(schema.indexConstituents).values([
      { indexKey: "total-market", symbol: "ABC", industry: "Capital Goods", fetchedOn: days.at(-1)! },
      { indexKey: "total-market", symbol: "DUMMYX", industry: "Capital Goods", fetchedOn: days.at(-1)! },
    ]);
    await computeVolumeLeaders();
    const rows = await db.select().from(schema.volumeLeaders);
    expect(rows.find((r) => r.period === 1)).toMatchObject({ symbol: "ABC", turnover: 100, sessions: 1 });
    expect(rows.find((r) => r.period === 5)).toMatchObject({ turnover: 500, sessions: 5 });
    expect(rows.some((r) => r.symbol === "DUMMYX")).toBe(false);
  });
});

// ── "× normal" on Top volume (spec 2026-10-07): the same normal as Money flow ──
import { computeMoneyFlow } from "../src/indicators/compute-money-flow";
import { NORMAL_SESSIONS } from "../src/indicators/money-flow";

describe("computeVolumeLeaders: normal_daily", () => {
  beforeEach(async () => {
    for (const t of [schema.dailyPrices, schema.ingestLog, schema.volumeLeaders, schema.unusualDays, schema.indexConstituents,
      schema.symbolChanges, schema.moneyFlow, schema.sectorFlowWeeks, schema.shortSessions]) await db.delete(t);
  });
  const seed = async (n: number, prices: (d: string, i: number) => { symbol: string; turnover: number }[], symbols: string[]) => {
    const days = hist(n).dates;
    await db.insert(schema.ingestLog).values(days.map((d) => ({ tradeDate: d, source: "bhavcopy", status: "ok", format: "udiff", rowCount: 1 })));
    const rows = days.flatMap((d, i) => prices(d, i).map((p) => ({ tradeDate: d, ...p, series: "EQ", open: 1, high: 1, low: 1, close: 1, prevClose: 1, volume: 10 })));
    for (let i = 0; i < rows.length; i += 1000) await db.insert(schema.dailyPrices).values(rows.slice(i, i + 1000));
    await db.insert(schema.indexConstituents).values(symbols.map((symbol) => ({ indexKey: "total-market", symbol, industry: "Media", fetchedOn: days.at(-1)! })));
    return days;
  };
  const tv = (i: number) => 1e7 + i * 1e5; // a different ₹ every day, so the wrong window shows
  const mean = (from: number, to: number) => { let s = 0; for (let i = from; i <= to; i++) s += tv(i); return s / (to - from + 1); };

  test("each period's normal is the 63 market sessions before its window, across a rename", async () => {
    const n = 200;
    const days = await seed(n, (_, i) => [{ symbol: i < 150 ? "OLDCO" : "NEWCO", turnover: tv(i) }], ["NEWCO"]);
    await db.insert(schema.symbolChanges).values({ oldSymbol: "OLDCO", newSymbol: "NEWCO", changedOn: days[150]! });
    await computeVolumeLeaders();
    const rows = await db.select().from(schema.volumeLeaders);
    for (const p of PERIODS) {
      const r = rows.find((x) => x.symbol === "NEWCO" && x.period === p)!;
      // window = ascending indices n-p … n-1; its normal = n-p-63 … n-p-1, mostly under OLDCO
      expect(r.normalDaily!).toBeCloseTo(mean(n - p - NORMAL_SESSIONS, n - p - 1), 3);
    }
  });

  test("the 6-month normal needs 126 + 63 = 189 market sessions", async () => {
    await seed(189, (_, i) => [{ symbol: "ABC", turnover: tv(i) }], ["ABC"]);
    await computeVolumeLeaders();
    const r189 = (await db.select().from(schema.volumeLeaders)).find((x) => x.period === 126)!;
    expect(r189.normalDaily!).toBeCloseTo(mean(0, 62), 3);
    for (const t of [schema.dailyPrices, schema.ingestLog, schema.volumeLeaders, schema.indexConstituents]) await db.delete(t);
    await seed(188, (_, i) => [{ symbol: "ABC", turnover: tv(i) }], ["ABC"]);
    await computeVolumeLeaders();
    const r188 = (await db.select().from(schema.volumeLeaders));
    expect(r188.find((x) => x.period === 126)!.normalDaily).toBeNull();
    expect(r188.find((x) => x.period === 63)!.normalDaily).not.toBeNull();
  });

  test("39 traded sessions in the 63 before: no normal; 40: a normal", async () => {
    const n = 100;
    // ABC trades only the last 39 sessions of the 1-day window's normal; XYZ the last 40
    await seed(n, (_, i) => [
      ...(i >= n - 1 - 39 ? [{ symbol: "ABC", turnover: 1e7 }] : []),
      ...(i >= n - 1 - 40 ? [{ symbol: "XYZ", turnover: 1e7 }] : []),
    ], ["ABC", "XYZ"]);
    await computeVolumeLeaders();
    const rows = await db.select().from(schema.volumeLeaders);
    expect(rows.find((x) => x.symbol === "ABC" && x.period === 1)!.normalDaily).toBeNull();
    expect(rows.find((x) => x.symbol === "XYZ" && x.period === 1)!.normalDaily).toBe(1e7);
  });

  test("Top volume's normal equals Money flow's for 1, 5 and 21 sessions (one fixture)", async () => {
    const n = 200;
    // gappy trading so the traded-session rule matters: GAP skips every 7th day (but trades the last one;
    // Top volume has no row for a window a stock did not trade in)
    await seed(n, (_, i) => [{ symbol: "ABC", turnover: tv(i) }, ...(i % 7 === 4 ? [] : [{ symbol: "GAP", turnover: 3 * tv(i) }])], ["ABC", "GAP"]);
    await computeVolumeLeaders();
    await computeMoneyFlow();
    const vl = await db.select().from(schema.volumeLeaders);
    const mf = await db.select().from(schema.moneyFlow);
    for (const sym of ["ABC", "GAP"]) for (const p of [1, 5, 21]) {
      const a = vl.find((x) => x.symbol === sym && x.period === p)!.normalDaily;
      const b = mf.find((x) => x.symbol === sym && x.period === p)!.normalDaily;
      expect(a).not.toBeNull();
      expect(Math.abs(a! - b!)).toBeLessThanOrEqual(1e-9 * b!); // the same function over the same sessions
    }
  });
});
