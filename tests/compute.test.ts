import { test, expect, describe, beforeEach } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { computeIndicators } from "../src/indicators/compute";
import { sma, ema } from "../src/indicators/moving-average";

/** 260 synthetic sessions for one symbol: a clean ramp, easy to verify by hand. */
function synthetic(symbol: string, n: number) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2020, 0, 1));
    d.setUTCDate(d.getUTCDate() + i);
    const close = 100 + i;
    rows.push({
      tradeDate: d.toISOString().slice(0, 10),
      symbol, series: "EQ",
      open: close, high: close, low: close, close, prevClose: close,
      volume: 1000, turnover: close * 1000,
    });
  }
  return rows;
}

describe("computeIndicators", () => {
  beforeEach(async () => {
    await db.delete(schema.dailyIndicators);
    await db.delete(schema.dailyPrices);
    await db.delete(schema.indexMembers);
  });

  test("writes one indicator row per price row for index members", async () => {
    const rows = synthetic("TESTCO", 260);
    await db.insert(schema.dailyPrices).values(rows);
    await db.insert(schema.indexMembers).values({
      indexName: "NIFTY50", symbol: "TESTCO", addedOn: "2020-01-01", removedOn: null,
    });

    const written = await computeIndicators();
    expect(written).toBe(260);

    const out = await db.select().from(schema.dailyIndicators);
    expect(out).toHaveLength(260);
  }, 30000);

  test("matches the pure sma/ema functions on the same series", async () => {
    const rows = synthetic("TESTCO", 260);
    await db.insert(schema.dailyPrices).values(rows);
    await db.insert(schema.indexMembers).values({
      indexName: "NIFTY50", symbol: "TESTCO", addedOn: "2020-01-01", removedOn: null,
    });
    await computeIndicators();

    const closes = rows.map((r) => r.close);
    const expectedSma200 = sma(closes, 200);
    const expectedEma200 = ema(closes, 200);
    const expectedSma50 = sma(closes, 50);
    const lastDate = rows[259]!.tradeDate;

    const [got] = await db
      .select()
      .from(schema.dailyIndicators)
      .where(and(
        eq(schema.dailyIndicators.symbol, "TESTCO"),
        eq(schema.dailyIndicators.tradeDate, lastDate),
      ));

    expect(got!.sma200!).toBeCloseTo(expectedSma200[259]!, 6);
    expect(got!.ema200!).toBeCloseTo(expectedEma200[259]!, 6);
    expect(got!.sma50!).toBeCloseTo(expectedSma50[259]!, 6);
  }, 30000);

  test("leaves the long averages null before the window fills", async () => {
    const rows = synthetic("TESTCO", 260);
    await db.insert(schema.dailyPrices).values(rows);
    await db.insert(schema.indexMembers).values({
      indexName: "NIFTY50", symbol: "TESTCO", addedOn: "2020-01-01", removedOn: null,
    });
    await computeIndicators();

    const [early] = await db
      .select()
      .from(schema.dailyIndicators)
      .where(and(
        eq(schema.dailyIndicators.symbol, "TESTCO"),
        eq(schema.dailyIndicators.tradeDate, rows[10]!.tradeDate),
      ));
    expect(early!.sma200).toBeNull();
    expect(early!.ema200).toBeNull();
    expect(early!.sma50).toBeNull();
  }, 30000);

  test("is idempotent: recomputing leaves the same number of rows", async () => {
    const rows = synthetic("TESTCO", 260);
    await db.insert(schema.dailyPrices).values(rows);
    await db.insert(schema.indexMembers).values({
      indexName: "NIFTY50", symbol: "TESTCO", addedOn: "2020-01-01", removedOn: null,
    });
    await computeIndicators();
    await computeIndicators();
    const out = await db.select().from(schema.dailyIndicators);
    expect(out).toHaveLength(260);
  }, 45000);
});
