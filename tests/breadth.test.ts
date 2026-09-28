import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { breadthSeries, latestBreakdown } from "../src/query/breadth";

async function seed() {
  await db.delete(schema.dailyIndicators);
  await db.delete(schema.indexMembers);

  await db.insert(schema.indexMembers).values([
    { indexName: "NIFTY50", symbol: "AAA", addedOn: "2020-01-01", removedOn: null },
    { indexName: "NIFTY50", symbol: "BBB", addedOn: "2020-01-01", removedOn: null },
    { indexName: "NIFTY50", symbol: "CCC", addedOn: "2020-01-01", removedOn: null },
    // left the index before our window — must not be counted
    { indexName: "NIFTY50", symbol: "OLD", addedOn: "2020-01-01", removedOn: "2020-01-05" },
  ]);

  await db.insert(schema.dailyIndicators).values([
    // 2020-02-01: AAA above, BBB and CCC below  => 1/3
    { tradeDate: "2020-02-01", symbol: "AAA", close: 110, sma50: 100, sma200: 100, ema200: 100 },
    { tradeDate: "2020-02-01", symbol: "BBB", close: 90, sma50: 100, sma200: 100, ema200: 100 },
    { tradeDate: "2020-02-01", symbol: "CCC", close: 95, sma50: 100, sma200: 100, ema200: 100 },
    { tradeDate: "2020-02-01", symbol: "OLD", close: 500, sma50: 100, sma200: 100, ema200: 100 },
    // 2020-02-02: all three above => 3/3
    { tradeDate: "2020-02-02", symbol: "AAA", close: 110, sma50: 100, sma200: 100, ema200: 100 },
    { tradeDate: "2020-02-02", symbol: "BBB", close: 120, sma50: 100, sma200: 100, ema200: 100 },
    { tradeDate: "2020-02-02", symbol: "CCC", close: 130, sma50: 100, sma200: 100, ema200: 100 },
    // 2020-02-03: sma200 not yet available for CCC => excluded from the count
    { tradeDate: "2020-02-03", symbol: "AAA", close: 110, sma50: 100, sma200: 100, ema200: 100 },
    { tradeDate: "2020-02-03", symbol: "BBB", close: 90, sma50: 100, sma200: 100, ema200: 100 },
    { tradeDate: "2020-02-03", symbol: "CCC", close: 95, sma50: 100, sma200: null, ema200: null },
  ]);
}

describe("breadthSeries", () => {
  beforeEach(seed);

  test("counts members above and below the chosen average", async () => {
    const series = await breadthSeries("sma200");
    const first = series.find((r) => r.date === "2020-02-01")!;
    expect(first.above).toBe(1);
    expect(first.below).toBe(2);
    expect(first.total).toBe(3);
    expect(first.pctAbove).toBeCloseTo(33.33, 1);
  });

  test("reaches 100 percent when every member is above", async () => {
    const series = await breadthSeries("sma200");
    const second = series.find((r) => r.date === "2020-02-02")!;
    expect(second.pctAbove).toBeCloseTo(100, 6);
  });

  test("excludes symbols whose average is not yet available", async () => {
    const series = await breadthSeries("sma200");
    const third = series.find((r) => r.date === "2020-02-03")!;
    expect(third.total).toBe(2); // CCC has a null sma200
  });

  test("excludes symbols that had already left the index", async () => {
    const series = await breadthSeries("sma200");
    expect(series.every((r) => r.total <= 3)).toBe(true);
  });

  test("returns dates in ascending order", async () => {
    const dates = (await breadthSeries("sma200")).map((r) => r.date);
    expect(dates).toEqual([...dates].sort());
  });

  test("supports the 50-day average, where CCC still has a value", async () => {
    const series = await breadthSeries("sma50");
    const third = series.find((r) => r.date === "2020-02-03")!;
    expect(third.total).toBe(3);
  });
});

describe("latestBreakdown", () => {
  beforeEach(seed);

  test("splits the newest session into above and below lists", async () => {
    const out = await latestBreakdown("sma200");
    expect(out.date).toBe("2020-02-03");
    expect(out.above.map((r) => r.symbol)).toEqual(["AAA"]);
    expect(out.below.map((r) => r.symbol)).toEqual(["BBB"]);
  });

  test("reports each symbol's distance from its average as a percentage", async () => {
    const out = await latestBreakdown("sma200");
    expect(out.above[0]!.pctFromMa).toBeCloseTo(10, 6);  // 110 vs 100
    expect(out.below[0]!.pctFromMa).toBeCloseTo(-10, 6); // 90 vs 100
  });

  test("sorts the below list weakest first", async () => {
    const out = await latestBreakdown("sma50");
    const pcts = out.below.map((r) => r.pctFromMa);
    expect(pcts).toEqual([...pcts].sort((a, b) => a - b));
  });
});
