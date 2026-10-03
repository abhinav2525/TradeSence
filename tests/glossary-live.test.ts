import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { liveExample } from "../src/query/glossary-live";
import { GLOSSARY, type TermId } from "../src/lib/glossary";

async function empty() {
  for (const t of [schema.dailyIndicators, schema.indexMembers, schema.indexPrices, schema.corporateActions, schema.symbolChanges]) await db.delete(t);
}

describe("liveExample", () => {
  beforeEach(empty);

  test("on an empty database every term returns null (never throws)", async () => {
    for (const id of Object.keys(GLOSSARY) as TermId[]) {
      if (id === "membership") continue; // from the committed CSV, not the database
      expect(await liveExample(id)).toBeNull();
    }
  });

  test("washout reads today's 200-day breadth", async () => {
    await db.insert(schema.indexMembers).values([
      { indexName: "NIFTY50", symbol: "UPCO", addedOn: "2020-01-01", removedOn: null },
      { indexName: "NIFTY50", symbol: "DOWNCO", addedOn: "2020-01-01", removedOn: null },
    ]);
    await db.insert(schema.dailyIndicators).values([
      { tradeDate: "2026-10-01", symbol: "UPCO", close: 110, sma50: 100, sma200: 100, ema200: 100, changePct: 1, volRatio: 1, turnover: 1e9 },
      { tradeDate: "2026-10-01", symbol: "DOWNCO", close: 90, sma50: 100, sma200: 100, ema200: 100, changePct: -1, volRatio: 1, turnover: 1e9 },
    ]);
    await db.insert(schema.indexPrices).values({ tradeDate: "2026-10-01", indexName: "Nifty 50", close: 24000 });
    expect(await liveExample("washout")).toBe("On 1 Oct 2026, 50% of NIFTY 50 stocks were above their 200-day SMA: no washout.");
    expect(await liveExample("episode")).toBeNull(); // no washout yet
  });

  test("net advances and SMA read today's numbers", async () => {
    await db.insert(schema.indexMembers).values([
      { indexName: "NIFTY50", symbol: "KOTAKBANK", addedOn: "2020-01-01", removedOn: null },
      { indexName: "NIFTY50", symbol: "DOWNCO", addedOn: "2020-01-01", removedOn: null },
    ]);
    await db.insert(schema.dailyIndicators).values([
      { tradeDate: "2026-10-01", symbol: "KOTAKBANK", close: 418.35, sma50: 405, sma200: 400.05, ema200: 400.26, changePct: 0.3, volRatio: 1, turnover: 1e9 },
      { tradeDate: "2026-10-01", symbol: "DOWNCO", close: 90, sma50: 100, sma200: 100, ema200: 100, changePct: -1, volRatio: 1, turnover: 1e9 },
    ]);
    expect(await liveExample("net-advances")).toBe("On 1 Oct 2026: 0 (1 rose, 1 fell).");
    expect(await liveExample("sma")).toBe("KOTAKBANK closed at ₹418.35 on 1 Oct 2026; its 200-day SMA was ₹400.05.");
  });

  test("membership comes from the committed history file", async () => {
    expect(await liveExample("membership")).toMatch(/^50 members today; the latest change was on \d+ \w{3} \d{4}\.$/);
  });
});

describe("liveExample wording on real-looking data", () => {
  beforeEach(empty);
  const day = (i: number) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);

  test("the NIFTY 50 entry gives the index's own close", async () => {
    await db.insert(schema.indexPrices).values({ tradeDate: "2026-10-01", indexName: "Nifty 50", open: null, high: null, low: null, close: 22421.95 });
    expect(await liveExample("nifty50")).toBe("The NIFTY 50 closed at 22,421.95 on 1 Oct 2026.");
  });

  test("percentile reads as an ordinal (33rd, not 33th)", async () => {
    await db.insert(schema.indexMembers).values({ indexName: "NIFTY50", symbol: "AAA", addedOn: "2020-01-01", removedOn: null });
    await db.insert(schema.dailyIndicators).values([0, 1, 2].map((i) => ({
      tradeDate: day(i), symbol: "AAA", close: i < 2 ? 110 : 90, sma50: 100, sma200: 100, ema200: 100, changePct: null, volRatio: null, turnover: null,
    })));
    expect(await liveExample("percentile")).toContain("at the 33rd percentile");
  });

  test("whipsaw ignores stocks with under a year of history (a new member has 0 crossings)", async () => {
    await db.insert(schema.indexMembers).values([
      { indexName: "NIFTY50", symbol: "OLDCO", addedOn: "2020-01-01", removedOn: null },
      { indexName: "NIFTY50", symbol: "NEWCO", addedOn: "2020-01-01", removedOn: null },
    ]);
    const rows = [];
    for (let i = 0; i < 300; i++) rows.push({ tradeDate: day(i), symbol: "OLDCO", close: i % 50 < 25 ? 110 : 90, sma50: 100, sma200: 100, ema200: 100, changePct: null, volRatio: null, turnover: null });
    for (let i = 295; i < 300; i++) rows.push({ tradeDate: day(i), symbol: "NEWCO", close: 110, sma50: 100, sma200: 100, ema200: 100, changePct: null, volRatio: null, turnover: null });
    for (let i = 0; i < rows.length; i += 500) await db.insert(schema.dailyIndicators).values(rows.slice(i, i + 500));
    const s = await liveExample("whipsaw");
    expect(s).toContain("OLDCO");
    expect(s).not.toContain("NEWCO");
  });

  test("whipsaw only ranks today's members, by rate (an ex-member is never named)", async () => {
    await db.insert(schema.indexMembers).values([
      { indexName: "NIFTY50", symbol: "OLDCO", addedOn: "2020-01-01", removedOn: null },
      { indexName: "NIFTY50", symbol: "EXCO", addedOn: "2020-01-01", removedOn: day(290) },
    ]);
    const rows = [];
    for (let i = 0; i < 300; i++) rows.push({ tradeDate: day(i), symbol: "OLDCO", close: i % 50 < 25 ? 110 : 90, sma50: 100, sma200: 100, ema200: 100, changePct: null, volRatio: null, turnover: null });
    for (let i = 0; i < 290; i++) rows.push({ tradeDate: day(i), symbol: "EXCO", close: 110, sma50: 100, sma200: 100, ema200: 100, changePct: null, volRatio: null, turnover: null });
    for (let i = 0; i < rows.length; i += 500) await db.insert(schema.dailyIndicators).values(rows.slice(i, i + 500));
    const s = await liveExample("whipsaw");
    expect(s).toContain("OLDCO");
    expect(s).not.toContain("EXCO");
  });
  test("the three new lights have live sentences for the showcase stock (or null, never a placeholder)", async () => {
    for (const id of ["right-now", "bad-days", "crash-episodes"] as const) {
      const s = await liveExample(id);
      expect(s === null || !/undefined|NaN|null/.test(s)).toBe(true);
    }
  });
});
