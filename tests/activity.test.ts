import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { computeUnusualDays } from "../src/indicators/compute-activity";
import type { History } from "../src/indicators/history";
import { unusualDays, unusualScore, KEPT_X, JUMP_PTS } from "../src/indicators/activity";

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
    turnover: fill(2e7), factors: fill(1), shareFactors: fill(1), traded: fill(1000), delivered: fill(400),
    ...over,
  } as History;
}
const at = (h: History, i: number, patch: Partial<Record<"volume" | "traded" | "delivered" | "close", number>>) => {
  for (const [k, v] of Object.entries(patch)) (h[k as keyof History] as number[])[i] = v!;
  return h;
};
const day = (h: History, i: number) => unusualDays(h).find((r) => r.tradeDate === h.dates[i]);

describe("unusualDays", () => {
  test("an ordinary history has no unusual days", () => {
    expect(unusualDays(hist(40))).toEqual([]);
  });

  test("Big keeping fires at exactly 5× delivered shares, not just below", () => {
    const h = at(hist(40), 30, { delivered: 2000, traded: 2500, volume: 2500 }); // 2000 = 5 × 400
    expect(day(h, 30)?.kept).toBe(true);
    expect(day(h, 30)?.keptRatio).toBeCloseTo(KEPT_X, 9);
    const h2 = at(hist(40), 30, { delivered: 1999, traded: 2500, volume: 2500 });
    expect(day(h2, 30)?.kept ?? false).toBe(false);
  });

  test("Huge volume fires at 5× traded shares", () => {
    const h = at(hist(40), 30, { volume: 5000, traded: 5000, delivered: 2000 });
    expect(day(h, 30)?.volume).toBe(true);
    expect(day(h, 30)?.volumeRatio).toBeCloseTo(5, 9);
  });

  test("Delivery jump at +30 points; collapse at −30 points", () => {
    const up = at(hist(40), 30, { delivered: 700 }); // 70% vs usual 40%
    expect(day(up, 30)?.jump).toBe(true);
    expect(day(up, 30)?.deliveryPct! - day(up, 30)?.usualDeliveryPct!).toBeCloseTo(JUMP_PTS, 9);
    const down = at(hist(40), 30, { delivered: 100 }); // 10% vs 40%
    expect(day(down, 30)?.collapse).toBe(true);
  });

  test("a 1:2 split inside the window fires nothing", () => {
    const n = 40;
    const split = (i: number) => i >= 25;
    const h = hist(n, {
      volume: Array.from({ length: n }, (_, i) => (split(i) ? 2000 : 1000)),
      traded: Array.from({ length: n }, (_, i) => (split(i) ? 2000 : 1000)),
      delivered: Array.from({ length: n }, (_, i) => (split(i) ? 800 : 400)),
      close: Array.from({ length: n }, (_, i) => (split(i) ? 50 : 100)),
      factors: Array.from({ length: n }, (_, i) => (split(i) ? 1 : 2)),
      shareFactors: Array.from({ length: n }, (_, i) => (split(i) ? 1 : 2)),
    });
    expect(unusualDays(h)).toEqual([]);
  });

  test("fewer than 15 earlier sessions: never fires", () => {
    const h = at(hist(30), 14, { delivered: 4000, traded: 9000, volume: 9000 });
    expect(day(h, 14)).toBeUndefined();
  });

  test("on an excluded day only Huge volume can fire", () => {
    const h = at(hist(40), 30, { delivered: 4000, traded: 9000, volume: 9000 });
    h.dates[30] = "2019-06-17";
    const r = day(h, 30)!;
    expect([r.kept, r.volume, r.jump, r.collapse]).toEqual([false, true, false, false]);
    expect(r.deliveryPct).toBeNull();
  });

  test("an illiquid stock never fires", () => {
    const h = at(hist(40, { turnover: Array.from({ length: 40 }, () => 5e6) }), 30, { delivered: 4000, traded: 9000, volume: 9000 });
    expect(unusualDays(h)).toEqual([]);
  });

  test("the day's move is on the adjusted close", () => {
    const h = at(hist(40), 30, { volume: 9000, traded: 9000, delivered: 3600, close: 110 });
    expect(day(h, 30)?.changePct).toBeCloseTo(10, 9);
  });
});

describe("unusualScore", () => {
  test("the largest ratio to its own threshold", () => {
    expect(unusualScore({ keptRatio: 10, volumeRatio: 6, deliveryPct: 50, usualDeliveryPct: 40 })).toBeCloseTo(2, 9);
    expect(unusualScore({ keptRatio: null, volumeRatio: 5, deliveryPct: 10, usualDeliveryPct: 100 })).toBeCloseTo(3, 9);
    expect(unusualScore({ keptRatio: null, volumeRatio: null, deliveryPct: null, usualDeliveryPct: null })).toBe(0);
  });
});

describe("computeUnusualDays", () => {
  beforeEach(async () => {
    for (const t of [schema.dailyPrices, schema.dailyDelivery, schema.corporateActions, schema.symbolChanges, schema.unusualDays]) await db.delete(t);
  });

  test("writes only the unusual days, and a re-run replaces rather than duplicates", async () => {
    const days = hist(40).dates;
    await db.insert(schema.dailyPrices).values(days.map((d, i) => ({
      tradeDate: d, symbol: "ABC", series: "EQ", open: 100, high: 101, low: 99, close: 100, prevClose: 100,
      volume: i === 30 ? 9000 : 1000, turnover: 2e7,
    })));
    await db.insert(schema.dailyDelivery).values(days.map((d, i) => ({
      tradeDate: d, symbol: "ABC", series: "EQ", tradedQty: i === 30 ? 9000 : 1000, deliverableQty: i === 30 ? 3600 : 400,
    })));
    await computeUnusualDays({ symbols: ["ABC"] });
    await computeUnusualDays({ symbols: ["ABC"] });
    const rows = await db.select().from(schema.unusualDays);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tradeDate: days[30], symbol: "ABC", volume: true, kept: true });
  });
});
