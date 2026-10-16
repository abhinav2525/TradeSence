import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { loadAdjustedHistory, loadRenames } from "../src/indicators/history";

const bar = (tradeDate: string, symbol: string, close: number, volume: number) => ({
  tradeDate, symbol, series: "EQ", open: close, high: close + 1, low: close - 1, close, prevClose: close, volume, turnover: close * volume,
});

describe("loadAdjustedHistory", () => {
  beforeEach(async () => {
    for (const t of [schema.dailyPrices, schema.corporateActions, schema.symbolChanges, schema.dailyDelivery]) await db.delete(t);
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

  test("carries delivery figures across a rename, null where a day has none", async () => {
    await db.insert(schema.dailyPrices).values([
      bar("2026-01-01", "OLDCO", 200, 100),
      bar("2026-01-02", "NEWCO", 200, 100),
      bar("2026-01-05", "NEWCO", 100, 200),
    ]);
    await db.insert(schema.symbolChanges).values({ oldSymbol: "OLDCO", newSymbol: "NEWCO", changedOn: "2026-01-02" });
    await db.insert(schema.dailyDelivery).values([
      { tradeDate: "2026-01-01", symbol: "OLDCO", series: "EQ", tradedQty: 100, deliverableQty: 40 },
      { tradeDate: "2026-01-05", symbol: "NEWCO", series: "EQ", tradedQty: 200, deliverableQty: 150 },
    ]);
    const h = await loadAdjustedHistory("NEWCO", await loadRenames());
    expect(h!.traded).toEqual([100, null, 200]);
    expect(h!.delivered).toEqual([40, null, 150]);
  });

  // Top volume counts trade-for-trade (BE) days too: a stock moved there is often the news.
  test("series option includes BE days, merged with EQ when both exist on a date", async () => {
    await db.insert(schema.dailyPrices).values([
      bar("2026-01-01", "ABC", 100, 10),
      { ...bar("2026-01-02", "ABC", 90, 20), series: "BE" },
      bar("2026-01-05", "ABC", 95, 30),
      { ...bar("2026-01-05", "ABC", 94, 5), series: "BE" },
    ]);
    const eqOnly = await loadAdjustedHistory("ABC", []);
    expect(eqOnly!.dates).toEqual(["2026-01-01", "2026-01-05"]);
    const both = await loadAdjustedHistory("ABC", [], { series: ["EQ", "BE"] });
    expect(both!.dates).toEqual(["2026-01-01", "2026-01-02", "2026-01-05"]);
    expect(both!.volume).toEqual([10, 20, 35]); // the shared date sums both series
    expect(both!.close).toEqual([100, 90, 95]); // and keeps the EQ price
  });

  test("no prices: null", async () => {
    expect(await loadAdjustedHistory("NOPE", [])).toBeNull();
  });

  test("demerger ex-dates through the lineage: filed under today's symbol or the old one in its window; never another company's", async () => {
    await db.insert(schema.dailyPrices).values([
      bar("2025-10-01", "OLDTM", 600, 100), bar("2025-10-14", "OLDTM", 400, 100), bar("2025-10-30", "NEWTM", 400, 100),
    ]);
    await db.insert(schema.symbolChanges).values({ oldSymbol: "OLDTM", newSymbol: "NEWTM", changedOn: "2025-10-24" });
    await db.insert(schema.corporateActions).values([
      // NSE files the past demerger under today's symbol
      { symbol: "NEWTM", exDate: "2025-10-14", subject: "Demerger", series: "EQ", kind: "demerger", factor: 1 },
      // filed under the old symbol while it was that company's: counts
      { symbol: "OLDTM", exDate: "2025-10-02", subject: "Demerger of unit B", series: "EQ", kind: "demerger", factor: 1 },
      // the old ticker after the rename (reused by someone else): doesn't
      { symbol: "OLDTM", exDate: "2026-02-02", subject: "Demerger", series: "EQ", kind: "demerger", factor: 1 },
      { symbol: "NEWTM", exDate: "2025-10-20", subject: "Bonus 1:1", series: "EQ", kind: "bonus", factor: 2 },
    ]);
    const h = (await loadAdjustedHistory("NEWTM", await loadRenames(), { series: ["EQ", "BE"] }))!;
    expect(h.demergers).toEqual(["2025-10-02", "2025-10-14"]);
  });
});

