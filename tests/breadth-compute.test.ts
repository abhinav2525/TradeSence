import { test, expect, describe, beforeEach } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { computeBreadth } from "../src/indicators/compute-breadth";

function weekdays(n: number): string[] {
  const out: string[] = []; const d = new Date("2025-01-01T00:00:00Z");
  while (out.length < n) { if (d.getUTCDay() % 6 !== 0) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
const price = (tradeDate: string, symbol: string, close: number, turnover: number) =>
  ({ tradeDate, symbol, series: "EQ", open: close, high: close, low: close, close, prevClose: close, volume: 10, turnover });

describe("computeBreadth", () => {
  beforeEach(async () => {
    for (const t of [schema.dailyPrices, schema.ingestLog, schema.breadthDaily, schema.indexConstituents, schema.symbolChanges, schema.fundSymbols]) await db.delete(t);
  });

  test("market every day (liquid only), lists on the latest day, upserts without deleting", async () => {
    const days = weekdays(260);
    await db.insert(schema.ingestLog).values(days.map((d) => ({ tradeDate: d, source: "bhavcopy", status: "ok", format: "udiff", rowCount: 3 })));
    await db.insert(schema.dailyPrices).values([
      ...days.map((d, i) => price(d, "UPCO", 100 + i, 2e7)), // rising: above every average
      ...days.map((d, i) => price(d, "DOWNCO", 400 - i, 2e7)), // falling: below
      ...days.map((d, i) => price(d, "TINYCO", 100 + i, 1e5)), // illiquid: left out of the market
    ]);
    await db.insert(schema.indexConstituents).values([
      { indexKey: "midcap-150", symbol: "UPCO", industry: "x", fetchedOn: days.at(-1)! },
      { indexKey: "midcap-150", symbol: "NOPRICE", industry: "x", fetchedOn: days.at(-1)! },
    ]);
    // a row saved on an earlier night, in another universe, must survive (the feature never deletes)
    await db.insert(schema.breadthDaily).values({ universe: "bank", ma: "sma200", tradeDate: "2024-12-31", above: 7, total: 9 });

    await computeBreadth();
    const r = await computeBreadth();
    expect(r.asOf).toBe(days.at(-1)!);

    const market = await db.select().from(schema.breadthDaily).where(and(eq(schema.breadthDaily.universe, "market"), eq(schema.breadthDaily.ma, "sma50")));
    expect(market).toHaveLength(260 - 49); // every day with a 50-day average, once
    expect(market.find((x) => x.tradeDate === days.at(-1))).toMatchObject({ above: 1, total: 2 });

    const list = await db.select().from(schema.breadthDaily).where(eq(schema.breadthDaily.universe, "midcap-150"));
    expect(list.filter((x) => x.tradeDate === days.at(-1)).map((x) => [x.ma, x.above, x.total]).sort()).toEqual([["ema200", 1, 1], ["sma200", 1, 1], ["sma50", 1, 1]]);
    expect(list).toHaveLength(3); // first run: today only, never drawn backwards
    const bank = await db.select().from(schema.breadthDaily).where(eq(schema.breadthDaily.universe, "bank"));
    expect(bank.find((x) => x.tradeDate === "2024-12-31")).toMatchObject({ above: 7, total: 9 });
  });

  test("a missed night is filled on the next run; a saved day is never rewritten", async () => {
    const days = weekdays(260);
    await db.insert(schema.dailyPrices).values(days.map((d, i) => price(d, "UPCO", 100 + i, 2e7)));
    await db.insert(schema.indexConstituents).values({ indexKey: "midcap-150", symbol: "UPCO", industry: "x", fetchedOn: days.at(-1)! });
    const log = (ds: string[]) => db.insert(schema.ingestLog).values(ds.map((d) => ({ tradeDate: d, source: "bhavcopy", status: "ok", format: "udiff", rowCount: 1 })));
    await log(days.slice(0, -2)); // the last two sessions not yet ingested
    await computeBreadth();
    // tamper with the saved reading: a later run must leave it alone
    await db.update(schema.breadthDaily).set({ above: 99 }).where(and(eq(schema.breadthDaily.universe, "midcap-150"), eq(schema.breadthDaily.tradeDate, days.at(-3)!)));
    await log(days.slice(-2)); // the Mac slept one night: two sessions arrive together
    await computeBreadth();
    const list = await db.select().from(schema.breadthDaily).where(and(eq(schema.breadthDaily.universe, "midcap-150"), eq(schema.breadthDaily.ma, "sma50")));
    expect(list.map((x) => x.tradeDate).sort()).toEqual(days.slice(-3));
    expect(list.find((x) => x.tradeDate === days.at(-3))!.above).toBe(99);
  });
});
