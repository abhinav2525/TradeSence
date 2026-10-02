import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { stockReport, supportedStocks } from "../src/query/stock-report";

const d = (i: number) => new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10);

async function reset() {
  for (const t of [schema.dailyIndicators, schema.indexMembers, schema.indexPrices, schema.corporateActions, schema.symbolChanges]) {
    await db.delete(t);
  }
}

/** n sessions for a symbol; moves from `move(i)`; close follows the moves from 100. */
async function seed(symbol: string, n: number, move: (i: number) => number | null, extra: Partial<{ turnover: number }> = {}) {
  let close = 100;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const m = i === 0 ? null : move(i);
    if (m !== null) close *= 1 + m / 100;
    rows.push({ tradeDate: d(i), symbol, close, sma50: 100, sma200: 100, ema200: 100, changePct: m, volRatio: 1, turnover: extra.turnover ?? 2e9 });
  }
  for (let i = 0; i < rows.length; i += 500) await db.insert(schema.dailyIndicators).values(rows.slice(i, i + 500));
}

async function seedIndex(n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({ tradeDate: d(i), indexName: "Nifty 50", open: null, high: null, low: null, close: 1000 + i }));
  for (let i = 0; i < rows.length; i += 500) await db.insert(schema.indexPrices).values(rows.slice(i, i + 500));
}

describe("stockReport", () => {
  beforeEach(reset);

  test("an unknown symbol is 'unknown' (the page 404s)", async () => {
    expect((await stockReport("NOPE")).kind).toBe("unknown");
  });

  test("a date before the stock's history is 'no-data'", async () => {
    await db.insert(schema.indexMembers).values({ indexName: "NIFTY50", symbol: "AAA", addedOn: "2020-01-01", removedOn: null });
    await seed("AAA", 10, () => 1);
    await seedIndex(10);
    expect(await stockReport("AAA", "2019-06-01")).toMatchObject({ kind: "no-data", firstDate: d(0) });
  });

  test("builds every check; a 1:5 split day (move ≈ 0 in change_pct) creates no drawdown", async () => {
    await db.insert(schema.indexMembers).values({ indexName: "NIFTY50", symbol: "AAA", addedOn: "2020-01-01", removedOn: null });
    // steady +0.1%/day; the split is invisible in change_pct by design (decision 0008)
    await seed("AAA", 800, () => 0.1);
    await seedIndex(800);
    const r = await stockReport("AAA");
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.report.worstFall.stock!.depthPct).toBeCloseTo(0, 9);
    expect(r.report.liquidity).toMatchObject({ light: "green", medianCrore: 200 });
    expect(r.report.horizons["1y"].stock).not.toBeNull();
    expect(r.report.horizons["1m"].stock!.shareNegative).toBe(0);
  });

  test("short history: 1y is 'not enough' (null) while 1w works", async () => {
    await db.insert(schema.indexMembers).values({ indexName: "NIFTY50", symbol: "NEW", addedOn: "2020-01-01", removedOn: null });
    await seed("NEW", 100, (i) => (i % 2 ? 1 : -1));
    await seedIndex(100);
    const r = await stockReport("NEW");
    if (r.kind !== "ok") throw new Error(r.kind);
    expect(r.report.horizons["1y"].stock).toBeNull();
    expect(r.report.horizons["1w"].stock).not.toBeNull();
  });

  test("a past member still gets a card, with when it left", async () => {
    await db.insert(schema.indexMembers).values({ indexName: "NIFTY50", symbol: "GONE", addedOn: "2020-01-01", removedOn: d(5) });
    await seed("GONE", 30, () => -1);
    await seedIndex(30);
    const r = await stockReport("GONE");
    if (r.kind !== "ok") throw new Error(r.kind);
    expect(r.report.membership).toEqual([{ addedOn: "2020-01-01", removedOn: d(5) }]);
  });

  test("events include corporate actions filed under an earlier symbol, and renames", async () => {
    await db.insert(schema.indexMembers).values({ indexName: "NIFTY50", symbol: "NEWN", addedOn: "2020-01-01", removedOn: null });
    await db.insert(schema.symbolChanges).values({ oldSymbol: "OLDN", newSymbol: "NEWN", changedOn: d(20), company: null });
    await db.insert(schema.corporateActions).values([
      { symbol: "OLDN", exDate: d(10), series: "EQ", subject: "Bonus 1:1", kind: "bonus", factor: 2, company: null, recordDate: null },
      { symbol: "NEWN", exDate: d(25), series: "EQ", subject: "Dividend - Rs 2 Per Share", kind: "other", factor: 1, company: null, recordDate: null },
    ]);
    await seed("NEWN", 30, () => 0.5);
    await seedIndex(30);
    const r = await stockReport("NEWN");
    if (r.kind !== "ok") throw new Error(r.kind);
    expect(r.report.events.map((e) => e.kind)).toEqual(["rename", "bonus"]);
    expect(r.report.dividends12m).toBe(1);
  });

  test("events before the card's history (e.g. a 2003 rename) are left out", async () => {
    await db.insert(schema.indexMembers).values({ indexName: "NIFTY50", symbol: "OLDR", addedOn: "2020-01-01", removedOn: null });
    await db.insert(schema.symbolChanges).values({ oldSymbol: "ANCIENT", newSymbol: "OLDR", changedOn: "2003-04-21", company: null });
    await seed("OLDR", 30, () => 0.5);
    await seedIndex(30);
    const r = await stockReport("OLDR");
    if (r.kind !== "ok") throw new Error(r.kind);
    expect(r.report.events).toEqual([]);
  });

  test("no look-ahead: a past date ignores later sessions", async () => {
    await db.insert(schema.indexMembers).values({ indexName: "NIFTY50", symbol: "AAA", addedOn: "2020-01-01", removedOn: null });
    await seed("AAA", 100, (i) => (i < 80 ? 0.1 : -5)); // crash after session 80
    await seedIndex(100);
    const r = await stockReport("AAA", d(79));
    if (r.kind !== "ok") throw new Error(r.kind);
    expect(r.report.date).toBe(d(79));
    expect(r.report.worstFall.stock!.depthPct).toBeCloseTo(0, 9);
  });
});

test("supportedStocks lists current members first", async () => {
  await reset();
  await db.insert(schema.indexMembers).values([
    { indexName: "NIFTY50", symbol: "ZED", addedOn: "2020-01-01", removedOn: null },
    { indexName: "NIFTY50", symbol: "OLD", addedOn: "2020-01-01", removedOn: "2021-01-01" },
  ]);
  expect(await supportedStocks()).toEqual([{ symbol: "ZED", current: true }, { symbol: "OLD", current: false }]);
});
