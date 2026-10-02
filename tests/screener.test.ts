import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { readSymbol, isNear, crosserBadge, percentile, screenerOn, volumeAtLeast } from "../src/query/screener";

const d = (i: number) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
const row = (i: number, close: number, ma: number | null, extra: Partial<{ changePct: number; volRatio: number }> = {}) =>
  ({ date: d(i), close, ma, changePct: extra.changePct ?? null, volRatio: extra.volRatio ?? null });

describe("readSymbol", () => {
  test("a cross above: yesterday at or under the average, today over it", () => {
    const r = readSymbol([row(0, 95, 100), row(1, 99, 100), row(2, 100, 100), row(3, 103, 100)]);
    expect(r).toMatchObject({ cross: "above", runBefore: 3 });
    expect(r!.pctFromMa!).toBeCloseTo(3, 9);
  });

  test("a cross below is the mirror", () => {
    const r = readSymbol([row(0, 105, 100), row(1, 101, 100), row(2, 98, 100)]);
    expect(r).toMatchObject({ cross: "below", runBefore: 2 });
  });

  test("staying on one side is not a cross", () => {
    expect(readSymbol([row(0, 105, 100), row(1, 106, 100)])!.cross).toBeNull();
  });

  test("the session the average first appears is not a cross", () => {
    expect(readSymbol([row(0, 90, null), row(1, 105, 100)])!.cross).toBeNull();
  });

  test("a hole in the data is not a cross", () => {
    expect(readSymbol([row(0, 95, 100), row(40, 105, 100)])!.cross).toBeNull();
  });

  test("the gap five sessions ago shows whether a near-line stock is closing in", () => {
    const rows = [0, 1, 2, 3, 4, 5].map((i) => row(i, 100 - 5 + i, 100)); // 95 → 100
    expect(readSymbol(rows)!.gap5!).toBeCloseTo(-5, 9);
  });

  test("a stock with no session on the day gives nothing", () => {
    expect(readSymbol([])).toBeNull();
  });
});

describe("isNear", () => {
  test("within 1% either side, exactly 1% included", () => {
    expect([1, -1, 0.99, -0.5].every(isNear)).toBe(true);
    expect([1.01, -1.2].some(isNear)).toBe(false);
  });
});

describe("volumeAtLeast", () => {
  // The table shows one decimal. A row reading "2.0×" must pass "≥2×", or the
  // filter hides a stock whose own row says it qualifies (BAJFINANCE, 1.96).
  test("compares the value as displayed, to one decimal", () => {
    expect(volumeAtLeast(1.96, 2)).toBe(true);
    expect(volumeAtLeast(1.94, 2)).toBe(false);
    expect(volumeAtLeast(null, 2)).toBe(false);
    expect(volumeAtLeast(null, 0)).toBe(true); // "Any" keeps stocks with no volume history
  });
});

describe("crosserBadge", () => {
  test("calm at or under the 25th percentile, busy at or over the 75th", () => {
    expect(crosserBadge(10, 20, 40)).toBe("Calm crosser");
    expect(crosserBadge(20, 20, 40)).toBe("Calm crosser");
    expect(crosserBadge(30, 20, 40)).toBe("Typical");
    expect(crosserBadge(40, 20, 40)).toBe("Busy");
  });

  test("percentile interpolates", () => {
    expect(percentile([10, 20, 30, 40, 50], 25)).toBe(20);
    expect(percentile([10, 20, 30, 40], 50)).toBe(25);
  });
});

describe("screenerOn", () => {
  beforeEach(async () => {
    await db.delete(schema.dailyIndicators);
    await db.delete(schema.indexMembers);
  });

  test("reads only members on that date, using the chosen average", async () => {
    await db.insert(schema.indexMembers).values([
      { indexName: "NIFTY50", symbol: "UPCO", addedOn: "2026-01-01", removedOn: null },
      { indexName: "NIFTY50", symbol: "GONE", addedOn: "2026-01-01", removedOn: d(1) }, // out from d(1)
    ]);
    const ind = (i: number, symbol: string, close: number) =>
      ({ tradeDate: d(i), symbol, close, sma50: 100, sma200: 100, ema200: 100, changePct: 1, volRatio: 2.5 });
    await db.insert(schema.dailyIndicators).values([
      ind(0, "UPCO", 98), ind(1, "UPCO", 103), ind(0, "GONE", 98), ind(1, "GONE", 103),
    ]);
    const res = await screenerOn("sma200", d(1));
    expect(res.date).toBe(d(1));
    expect(res.rows.map((r) => r.symbol)).toEqual(["UPCO"]);
    expect(res.rows[0]).toMatchObject({ cross: "above", volRatio: 2.5, changePct: 1 });
  });
});
