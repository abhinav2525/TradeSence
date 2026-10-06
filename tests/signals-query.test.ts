import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { signalsData } from "../src/query/signals";
import { NIFTY_BANK } from "../src/ingest/indices";

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

  test("Nifty Bank: its own members on each date and its own close (decision 0035)", async () => {
    await db.insert(schema.indexMembers).values([
      { indexName: "NIFTYBANK", symbol: "BK1", addedOn: "2020-01-01", removedOn: null },
      { indexName: "NIFTYBANK", symbol: "BK2", addedOn: "2020-01-01", removedOn: null },
      { indexName: "NIFTYBANK", symbol: "GONE", addedOn: "2020-01-01", removedOn: "2026-10-01" },
      { indexName: "NIFTY50", symbol: "NF1", addedOn: "2020-01-01", removedOn: null },
    ]);
    await db.insert(schema.dailyIndicators).values([
      row("2026-09-29", "BK1", 90), row("2026-09-29", "BK2", 90), row("2026-09-29", "GONE", 110), row("2026-09-29", "NF1", 110),
      row("2026-09-30", "BK1", 90), row("2026-09-30", "BK2", 90), row("2026-09-30", "GONE", 110), row("2026-09-30", "NF1", 110),
      row("2026-10-01", "BK1", 110), row("2026-10-01", "BK2", 90), row("2026-10-01", "GONE", 110), row("2026-10-01", "NF1", 110),
    ]);
    // Nifty Bank has closes on 29 Sep and 1 Oct; the NIFTY 50 only on 30 Sep
    await db.insert(schema.indexPrices).values([
      { tradeDate: "2026-09-29", indexName: "Nifty Bank", close: 50000 },
      { tradeDate: "2026-10-01", indexName: "Nifty Bank", close: 51000 },
      { tradeDate: "2026-09-30", indexName: "Nifty 50", close: 24000 },
    ]);
    const s = await signalsData(NIFTY_BANK);
    expect(s.recent.map((r) => r.date)).toEqual(["2026-09-29", "2026-10-01"]);
    expect(s.recent[0]!.pct).toBeCloseTo(100 / 3, 9); // GONE still a member on 29 Sep
    // 1 Oct: GONE has left, BK1 above, BK2 below: 1 of 2
    expect(s.washout).toMatchObject({ date: "2026-10-01", pct: 50, above: 1, total: 2 });
  });
});
