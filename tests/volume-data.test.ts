import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { marketTurnover, memberWindows, niftyCloses, stockIndicators } from "../src/research/volume-data";

const ind = (tradeDate: string, symbol: string, changePct: number | null, turnover: number) =>
  ({ tradeDate, symbol, close: 100, sma50: 100, sma200: 99, ema200: 100, changePct, volRatio: 1.2, turnover });

describe("volume-data", () => {
  beforeEach(async () => {
    for (const t of [schema.dailyIndicators, schema.indexMembers, schema.indexPrices]) await db.delete(t);
  });

  test("marketTurnover sums ₹ turnover of rising and falling members, per date, members only", async () => {
    await db.insert(schema.indexMembers).values([
      { indexName: "NIFTY50", symbol: "UP", addedOn: "2020-01-01", removedOn: null },
      { indexName: "NIFTY50", symbol: "DN", addedOn: "2020-01-01", removedOn: null },
      { indexName: "NIFTY50", symbol: "GONE", addedOn: "2020-01-01", removedOn: "2026-01-01" },
    ]);
    await db.insert(schema.dailyIndicators).values([
      ind("2026-10-01", "UP", 1, 300), ind("2026-10-01", "DN", -1, 100), ind("2026-10-01", "GONE", 2, 999),
      ind("2026-10-01", "OUTSIDER", 3, 500),
    ]);
    expect(await marketTurnover()).toEqual([{ date: "2026-10-01", up: 300, down: 100 }]);
  });

  test("memberWindows, niftyCloses and stockIndicators", async () => {
    await db.insert(schema.indexMembers).values({ indexName: "NIFTY50", symbol: "UP", addedOn: "2020-01-01", removedOn: "2024-03-28" });
    await db.insert(schema.indexPrices).values({ tradeDate: "2026-10-01", indexName: "Nifty 50", close: 24000 });
    await db.insert(schema.dailyIndicators).values(ind("2026-10-01", "UP", 1, 300));
    expect((await memberWindows()).get("UP")).toEqual([{ addedOn: "2020-01-01", removedOn: "2024-03-28" }]);
    expect((await niftyCloses()).get("2026-10-01")).toBe(24000);
    expect((await stockIndicators("UP")).get("2026-10-01")).toEqual({ sma200: 99, volRatio: 1.2, close: 100 });
  });
});
