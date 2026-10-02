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

/** Explicit closes; change_pct follows them; sma_200 = 100 (so breadth is "above" when close > 100). */
async function seedCloses(symbol: string, closes: number[], rawClose?: (i: number, c: number) => number) {
  const rows = closes.map((c, i) => ({
    tradeDate: d(i), symbol, close: rawClose ? rawClose(i, c) : c, sma50: 100, sma200: 100, ema200: 100,
    changePct: i === 0 ? null : (c / closes[i - 1]! - 1) * 100, volRatio: 1, turnover: 2e9,
  }));
  for (let i = 0; i < rows.length; i += 500) await db.insert(schema.dailyIndicators).values(rows.slice(i, i + 500));
}
async function seedIndexCloses(closes: number[]) {
  const rows = closes.map((close, i) => ({ tradeDate: d(i), indexName: "Nifty 50", open: null, high: null, low: null, close }));
  for (let i = 0; i < rows.length; i += 500) await db.insert(schema.indexPrices).values(rows.slice(i, i + 500));
}
const member = (symbol: string) => db.insert(schema.indexMembers).values({ indexName: "NIFTY50", symbol, addedOn: "2020-01-01", removedOn: null });

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
  test("In crashes: three completed episodes count, today's ongoing one is mentioned, light from the median ratio", async () => {
    await member("CR");
    const N = 800, starts = [300, 450, 600, 790];
    const stock = Array.from({ length: N }, () => 110), nifty = Array.from({ length: N }, () => 1100);
    for (const s of starts) {
      [99, 95, 90, 95, 99].forEach((v, k) => { if (s + k < N) stock[s + k] = v; });
      [1089, 1070, 1050, 1070, 1089].forEach((v, k) => { if (s + k < N) nifty[s + k] = v; });
    }
    await seedCloses("CR", stock);
    await seedIndexCloses(nifty);
    const r = await stockReport("CR");
    if (r.kind !== "ok") throw new Error(r.kind);
    const c = r.report.crashes;
    expect(c.episodes.map((e) => e.start)).toEqual([d(300), d(450), d(600)]);
    expect(c.ongoing).toBe(d(790));
    expect(c.ratio!).toBeCloseTo((90 / 99 - 1) / (1050 / 1089 - 1), 9); // 2.54×
    expect(c.light).toBe("red");
    expect(c).toMatchObject({ backCount: 3, backOf: 3 });
  });

  test("a past date inside a crash: only data up to it, the crash is ongoing (no hindsight)", async () => {
    await member("CR");
    const stock = Array.from({ length: 400 }, (_, i) => (i >= 300 && i < 305 ? 95 : 110));
    await seedCloses("CR", stock);
    await seedIndexCloses(stock.map((c) => c * 10));
    const r = await stockReport("CR", d(305));
    if (r.kind !== "ok") throw new Error(r.kind);
    expect(r.report.crashes).toMatchObject({ episodes: [], ongoing: d(300), light: null });
  });

  test("Right now: a steady ±1% stock reads its usual self, a ±2.2% week, and every week inside", async () => {
    await member("ALT");
    await seed("ALT", 400, (i) => (i % 2 ? 1 : -1));
    await seedIndex(400);
    const r = await stockReport("ALT");
    if (r.kind !== "ok") throw new Error(r.kind);
    const n = r.report.rightNow;
    expect(n.light).toBe("green");
    expect(n.ratio!).toBeCloseTo(1, 1);
    expect(n.weekPct!).toBeCloseTo(Math.sqrt(5), 1);
    expect(n.hit).toEqual({ inside: 375, of: 375 }); // weeks start 0..394, but σ only exists from day 20: 375
  });

  test("Bad days: a stock that moves 2× the NIFTY falls 2% when it falls 1%: red", async () => {
    await member("CAP");
    const m = (i: number) => ((i % 7) - 3) * 0.5;
    await seed("CAP", 300, (i) => 2 * m(i));
    const closes = [1000];
    for (let i = 1; i < 300; i++) closes.push(closes[i - 1]! * (1 + m(i) / 100));
    await seedIndexCloses(closes);
    const r = await stockReport("CAP");
    if (r.kind !== "ok") throw new Error(r.kind);
    const b = r.report.badDays;
    expect(b.capture!.beta).toBeCloseTo(2, 6);
    expect(b.capture!.down).toBeCloseTo(200, 6);
    expect(b.light).toBe("red");
  });

  test("a short history gets no new lights, never a guessed colour", async () => {
    await member("NEW");
    await seed("NEW", 100, (i) => (i % 2 ? 1 : -1));
    await seedIndex(100);
    const r = await stockReport("NEW");
    if (r.kind !== "ok") throw new Error(r.kind);
    expect([r.report.rightNow.light, r.report.badDays.light, r.report.crashes.light]).toEqual([null, null, null]);
  });

  test("a raw split (close ÷ 5, flat adjusted move) changes neither σ nor beta", async () => {
    for (const s of ["PLAIN", "SPLIT"]) await member(s);
    const closes = Array.from({ length: 400 }, (_, i) => 100 * (1 + 0.01 * Math.sin(i)));
    await seedCloses("PLAIN", closes);
    await seedCloses("SPLIT", closes, (i, c) => (i >= 200 ? c / 5 : c));
    const idx = [1000];
    for (let i = 1; i < 400; i++) idx.push(idx[i - 1]! * (1 + 0.004 * Math.cos(i)));
    await seedIndexCloses(idx);
    const a = await stockReport("PLAIN"), b = await stockReport("SPLIT");
    if (a.kind !== "ok" || b.kind !== "ok") throw new Error("no report");
    expect(b.report.rightNow.sigma!).toBeCloseTo(a.report.rightNow.sigma!, 9);
    expect(b.report.badDays.capture!.beta).toBeCloseTo(a.report.badDays.capture!.beta, 9);
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
