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

  test("builds every check from a steady rise (no fall, green liquidity, every horizon)", async () => {
    await db.insert(schema.indexMembers).values({ indexName: "NIFTY50", symbol: "AAA", addedOn: "2020-01-01", removedOn: null });
    // steady +0.1%/day (the split case has its own test below)
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

  test("a 1:5 split (raw close ÷ 5, flat adjusted move) is no cliff, no drawdown, no bad stretch", async () => {
    await db.insert(schema.indexMembers).values({ indexName: "NIFTY50", symbol: "SPL", addedOn: "2020-01-01", removedOn: null });
    const rows = Array.from({ length: 800 }, (_, i) => {
      const raw = i < 500 ? 500 : 100; // what bhavcopy says: an 80% "crash" on day 500
      return { tradeDate: d(i), symbol: "SPL", close: raw, sma50: raw, sma200: raw, ema200: raw, changePct: i === 0 ? null : 0, volRatio: 1, turnover: 2e9 };
    });
    for (let i = 0; i < rows.length; i += 500) await db.insert(schema.dailyIndicators).values(rows.slice(i, i + 500));
    await seedIndex(800);
    const r = await stockReport("SPL");
    if (r.kind !== "ok") throw new Error(r.kind);
    const jumps = r.report.price.slice(1).filter((p, i) => Math.abs(p.close / r.report.price[i]!.close - 1) > 0.3);
    expect(jumps).toEqual([]);
    expect(r.report.price[0]!.close).toBeCloseTo(100, 6); // in today's rupees
    expect(r.report.price[0]!.sma200!).toBeCloseTo(100, 6);
    expect(r.report.worstFall.stock!.depthPct).toBeCloseTo(0, 9);
    expect(r.report.horizons["1y"].stock!.worst).toBeCloseTo(0, 9);
  });

  test("short history: 1y is 'not enough' (null) while 1w works", async () => {
    await db.insert(schema.indexMembers).values({ indexName: "NIFTY50", symbol: "NEW", addedOn: "2020-01-01", removedOn: null });
    await seed("NEW", 100, (i) => (i % 2 ? 1 : -1));
    await seedIndex(100);
    const r = await stockReport("NEW");
    if (r.kind !== "ok") throw new Error(r.kind);
    expect(r.report.horizons["1y"].stock).toBeNull();
    expect(r.report.horizons["1w"].stock).not.toBeNull();
    // a worst fall from 100 sessions isn't a stock's worst fall (JIOFIN after 12 sessions read 6.9×)
    expect(r.report.worstFall.light).toBeNull();
    expect(r.report.worstFall.stock).toBeNull();
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
    await seed("AAA", 400, (i) => (i < 300 ? 0.1 : -5)); // crash after session 300
    await seedIndex(400);
    const r = await stockReport("AAA", d(299));
    if (r.kind !== "ok") throw new Error(r.kind);
    expect(r.report.date).toBe(d(299));
    expect(r.report.lastDate).toBe(d(399)); // for the date picker's upper bound
    expect(r.report.worstFall.stock!.depthPct).toBeCloseTo(0, 9);
  });
  test("Strength ranks the stock against the other members only (0013: the weakest reads 0%, never counted against itself)", async () => {
    await db.insert(schema.indexMembers).values(["LOW", "MID", "HIGH"].map((symbol) => ({ indexName: "NIFTY50", symbol, addedOn: "2020-01-01", removedOn: null })));
    // 0.0917 is chosen so the long and short chains round differently; the bug lost LOW itself
    await seed("LOW", 400, () => -0.0917);
    await seed("MID", 400, () => 0.01);
    await seed("HIGH", 400, () => 0.2);
    await seedIndex(400);
    const at = async (s: string) => { const r = await stockReport(s); if (r.kind !== "ok") throw new Error(r.kind); return r.report.strength; };
    expect(await at("LOW")).toMatchObject({ percentile: 0, peers: 2, light: "red" });
    expect(await at("MID")).toMatchObject({ percentile: 50, peers: 2 });
    expect(await at("HIGH")).toMatchObject({ percentile: 100, peers: 2, light: "green" });
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
