import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { signalsData } from "../src/query/signals";

const row = (tradeDate: string, symbol: string, close: number) =>
  ({ tradeDate, symbol, close, sma50: 100, sma200: 100, ema200: 100, changePct: 0, volRatio: 1, turnover: 1e9 });

describe("signalsData", () => {
  beforeEach(async () => {
    for (const t of [schema.dailyIndicators, schema.indexMembers, schema.indexPrices]) await db.delete(t);
  });

  test("joins 200-day breadth to NIFTY 50 closes by date, skipping days without a close", async () => {
    await db.insert(schema.indexMembers).values([
      { indexName: "NIFTY50", symbol: "UPCO", addedOn: "2020-01-01", removedOn: null },
      { indexName: "NIFTY50", symbol: "DOWNCO", addedOn: "2020-01-01", removedOn: null },
    ]);
    await db.insert(schema.dailyIndicators).values([
      row("2026-09-30", "UPCO", 110), row("2026-09-30", "DOWNCO", 90),
      row("2026-10-01", "UPCO", 110), row("2026-10-01", "DOWNCO", 90),
    ]);
    await db.insert(schema.indexPrices).values({ tradeDate: "2026-10-01", indexName: "Nifty 50", close: 24000 });

    const s = await signalsData();
    expect(s.washout).toMatchObject({ date: "2026-10-01", pct: 50, status: "quiet", fired: 0 });
    expect(s.recent).toEqual([{ date: "2026-10-01", pct: 50 }]);
  });

  test("an empty database gives nothing to show, without throwing", async () => {
    const s = await signalsData();
    expect(s.washout).toBeNull();
    expect(s.first).toBeNull();
  });
});
