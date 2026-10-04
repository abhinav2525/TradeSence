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
