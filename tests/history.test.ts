import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { loadAdjustedHistory, loadRenames } from "../src/indicators/history";

const bar = (tradeDate: string, symbol: string, close: number, volume: number) => ({
  tradeDate, symbol, series: "EQ", open: close, high: close + 1, low: close - 1, close, prevClose: close, volume, turnover: close * volume,
});

describe("loadAdjustedHistory", () => {
  beforeEach(async () => {
    for (const t of [schema.dailyPrices, schema.corporateActions, schema.symbolChanges]) await db.delete(t);
  });

  test("joins a renamed company's old symbol and adjusts prices and volume for a split", async () => {
    await db.insert(schema.dailyPrices).values([
      bar("2026-01-01", "OLDCO", 200, 100),
      bar("2026-01-02", "NEWCO", 200, 100),
      bar("2026-01-05", "NEWCO", 100, 200), // 1:2 split ex-date
    ]);
    await db.insert(schema.symbolChanges).values({ oldSymbol: "OLDCO", newSymbol: "NEWCO", changedOn: "2026-01-02" });
    await db.insert(schema.corporateActions).values({
      symbol: "NEWCO", exDate: "2026-01-05", subject: "Split From Rs 10 To Rs 5", series: "EQ", kind: "split", factor: 2,
    });

    const h = await loadAdjustedHistory("NEWCO", await loadRenames());
    expect(h!.dates).toEqual(["2026-01-01", "2026-01-02", "2026-01-05"]);
    expect(h!.high).toEqual([201, 201, 101]);
    expect(h!.low).toEqual([199, 199, 99]);
    expect(h!.factors).toEqual([2, 2, 1]);
    expect(h!.shareFactors).toEqual([2, 2, 1]);
    expect(h!.volume).toEqual([100, 100, 200]); // raw; callers apply shareFactors
  });

  test("no prices: null", async () => {
    expect(await loadAdjustedHistory("NOPE", [])).toBeNull();
  });
});
