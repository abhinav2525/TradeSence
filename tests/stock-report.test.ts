import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { stockReport, supportedStocks } from "../src/query/stock-report";
import { checksOf, peersLine, cardExtra } from "../src/components/StockChecks";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import IndexTabs from "../src/components/IndexTabs";
import { NIFTY_BANK } from "../src/ingest/indices";

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
    expect(c.ratio!).toBeCloseTo((90 / 110 - 1) / (1050 / 1100 - 1), 9); // from the 110 / 1,100 high before each crash: 4.0×
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
    // the hit rate judged each past week by the range known THEN, not today's range (review finding)
    const sentence = checksOf(r.report).find((c) => c.label === "Right now")!.sentence;
    expect(sentence).toContain("stayed inside the range this method gave at the time");
    expect(sentence).not.toContain("inside this range");
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
  expect(await supportedStocks()).toEqual([
    { symbol: "ZED", current: true, currentIn: ["nifty50"] }, { symbol: "OLD", current: false, currentIn: [] },
  ]);

});

// ── Step B (decision 0035): a Report Card for every registered index's member ──
// AAA is in both indices; NFX, NFY only the NIFTY 50; BNK only Nifty Bank; BLEFT left Nifty Bank on d(200).
// NIFTY 50 stocks dip under their 200-day line on d(100)–d(110) (a NIFTY 50 crash); the banks never do.
// The NIFTY 50's close moves exactly like BNK, Nifty Bank's doesn't: so BNK's beta is 1 only if the
// market line is the NIFTY 50.
describe("Report Cards across registered indices (step B)", () => {
  const N = 300;
  const dip = (i: number) => (i >= 100 && i <= 110 ? 80 : 120);
  const wiggle = (i: number, k: number) => 120 * (1 + 0.01 * Math.sin(i * k));
  beforeEach(async () => {
    await reset();
    const m = (indexName: string, symbol: string, removedOn: string | null = null) => ({ indexName, symbol, addedOn: "2020-01-01", removedOn });
    await db.insert(schema.indexMembers).values([
      m("NIFTY50", "AAA"), m("NIFTY50", "NFX"), m("NIFTY50", "NFY"),
      m("NIFTYBANK", "AAA"), m("NIFTYBANK", "BNK"), m("NIFTYBANK", "BLEFT", d(200)),
    ]);
    const series = (f: (i: number) => number) => Array.from({ length: N }, (_, i) => f(i));
    await seedCloses("AAA", series((i) => dip(i) * (1 + 0.002 * i / N)));
    await seedCloses("NFX", series((i) => dip(i) * (1 + 0.004 * i / N)));
    await seedCloses("NFY", series((i) => dip(i) * (1 + 0.006 * i / N)));
    await seedCloses("BNK", series((i) => wiggle(i, 1)));
    await seedCloses("BLEFT", series((i) => wiggle(i, 0.7)));
    await seedIndexCloses(series((i) => wiggle(i, 1) * 10)); // "Nifty 50" moves like BNK
    await db.insert(schema.indexPrices).values(series((i) => 1000 + i).map((close, i) => ({ tradeDate: d(i), indexName: "Nifty Bank", open: null, high: null, low: null, close })));
  });

  test("a Bank-only stock gets a card, ranked among Nifty Bank's members on the date", async () => {
    const r = await stockReport("BNK");
    if (r.kind !== "ok") throw new Error(r.kind);
    expect(r.report.peerIndex).toEqual({ key: "bank", label: "Nifty Bank" });
    expect(r.report.indices).toEqual(["bank"]);
    expect(r.report.strength.peers).toBe(1); // AAA; BLEFT left on d(200)
    const before = await stockReport("BNK", d(150));
    if (before.kind !== "ok") throw new Error(before.kind);
    expect(before.report.strength.peers).toBe(2); // AAA and BLEFT, still a member then
  });

  test("a Bank-only stock's risk lights are measured against the NIFTY 50, not Nifty Bank", async () => {
    const r = await stockReport("BNK");
    if (r.kind !== "ok") throw new Error(r.kind);
    expect(r.report.badDays.capture!.beta).toBeCloseTo(1, 6);
    expect(r.report.badDays.capture!.down).toBeCloseTo(100, 6);
    // the crash comes from NIFTY 50 breadth (banks never dipped, so Nifty Bank breadth has none)
    expect(r.report.crashes.episodes.map((e) => e.start)).toEqual([d(100)]);
  });

  test("a stock in both: NIFTY 50 peers by default, Nifty Bank's with the bank key", async () => {
    const def = await stockReport("AAA");
    const bank = await stockReport("AAA", undefined, "bank");
    if (def.kind !== "ok" || bank.kind !== "ok") throw new Error("no report");
    expect(def.report.peerIndex.key).toBe("nifty50");
    expect(def.report.indices).toEqual(["nifty50", "bank"]);
    expect(def.report.strength.peers).toBe(2); // NFX, NFY
    expect(bank.report.peerIndex.key).toBe("bank");
    expect(bank.report.strength.peers).toBe(1); // BNK
    // only the peer rank changes: the market comparisons are the same numbers
    expect(bank.report.badDays.capture!.beta).toBeCloseTo(def.report.badDays.capture!.beta, 12);
    expect(bank.report.crashes.episodes).toEqual(def.report.crashes.episodes);
  });

  test("a key the stock was never in, or junk, falls back to its default peers", async () => {
    for (const k of ["bank", "junk", ""]) {
      const r = await stockReport("NFX", undefined, k);
      if (r.kind !== "ok") throw new Error(r.kind);
      expect(r.report.peerIndex.key).toBe("nifty50");
    }
  });

  test("supportedStocks lists every registered index's members once, with where each is now", async () => {
    expect(await supportedStocks()).toEqual([
      { symbol: "AAA", current: true, currentIn: ["nifty50", "bank"] },
      { symbol: "BNK", current: true, currentIn: ["bank"] },
      { symbol: "NFX", current: true, currentIn: ["nifty50"] },
      { symbol: "NFY", current: true, currentIn: ["nifty50"] },
      { symbol: "BLEFT", current: false, currentIn: [] },
    ]);
  });

  test("Strength names the peer index and reads 'x of N' for Nifty Bank; NIFTY 50 wording unchanged", async () => {
    const bank = await stockReport("AAA", undefined, "bank");
    const def = await stockReport("AAA");
    if (bank.kind !== "ok" || def.kind !== "ok") throw new Error("no report");
    // 6-month returns on d(299): AAA +0.084%, BNK −0.311% (BLEFT left on d(200)); NFX +0.168%, NFY +0.251%
    expect(bank.report.strength.ret6m!).toBeCloseTo(0.0839032, 6);
    expect(bank.report.strength).toMatchObject({ below: 1, peers: 1, percentile: 100 });
    expect(def.report.strength).toMatchObject({ below: 0, peers: 2, percentile: 0 });
    const sb = checksOf(bank.report).find((c) => c.label === "Strength")!;
    expect(sb.sentence).toBe("6-month return +0.1% vs the NIFTY 50's −0.3%: stronger than 1 of the 1 other Nifty Bank member on this day.");
    expect(sb.figure).toBe("1 of 1");
    const sd = checksOf(def.report).find((c) => c.label === "Strength")!;
    expect(sd.sentence).toBe("6-month return +0.1% vs the NIFTY 50's −0.3%: stronger than 0% of the other 2 members on this day.");
    expect(sd.figure).toBe("0th");
  });

  test("Strength on d(150), two Bank peers: the plural wording and exact counts", async () => {
    // d(150): AAA +0.084%, BNK +0.192%, BLEFT −0.084% (still a member)
    const aaa = await stockReport("AAA", d(150), "bank"), bnk = await stockReport("BNK", d(150));
    if (aaa.kind !== "ok" || bnk.kind !== "ok") throw new Error("no report");
    expect(aaa.report.strength).toMatchObject({ below: 1, peers: 2, percentile: 50 });
    expect(bnk.report.strength).toMatchObject({ below: 2, peers: 2, percentile: 100 });
    const sa = checksOf(aaa.report).find((c) => c.label === "Strength")!;
    expect(sa.sentence).toBe("6-month return +0.1% vs the NIFTY 50's +0.2%: stronger than 1 of the 2 other Nifty Bank members on this day.");
    expect(sa.figure).toBe("1 of 2");
  });

  test("a Bank joiner (added d(200)) is not a peer before it joined, and is one after", async () => {
    await db.insert(schema.indexMembers).values({ indexName: "NIFTYBANK", symbol: "JOIN", addedOn: d(200), removedOn: null });
    await seedCloses("JOIN", Array.from({ length: N }, (_, i) => wiggle(i, 0.3)));
    const before = await stockReport("BNK", d(150)), after = await stockReport("BNK");
    if (before.kind !== "ok" || after.kind !== "ok") throw new Error("no report");
    expect(before.report.strength.peers).toBe(2); // AAA, BLEFT: not JOIN
    expect(after.report.strength.peers).toBe(2); // AAA, JOIN: not BLEFT
  });

  test("the peer count below is the rank's own count", async () => {
    const r = await stockReport("NFY");
    if (r.kind !== "ok") throw new Error(r.kind);
    expect(r.report.strength.below).toBe(2); // NFY rose most of the three NIFTY 50 stocks
    expect(r.report.strength.percentile).toBe(100);
  });

  test("default peers = the first registered index the stock is in ON THE SHOWN DATE (left the NIFTY 50, in Nifty Bank today)", async () => {
    await db.insert(schema.indexMembers).values([
      { indexName: "NIFTY50", symbol: "MOVED", addedOn: "2020-01-01", removedOn: d(100) },
      { indexName: "NIFTYBANK", symbol: "MOVED", addedOn: "2020-01-01", removedOn: null },
    ]);
    await seedCloses("MOVED", Array.from({ length: N }, (_, i) => wiggle(i, 0.4)));
    const latest = await stockReport("MOVED");
    const past = await stockReport("MOVED", d(50));
    if (latest.kind !== "ok" || past.kind !== "ok") throw new Error("no report");
    expect(latest.report.peerIndex.key).toBe("bank");
    expect(latest.report.defaultKey).toBe("bank");
    expect(past.report.peerIndex.key).toBe("nifty50");
    expect(past.report.defaultKey).toBe("nifty50");
    // the other index stays reachable with its key, and the default is still that date's
    const asNifty = await stockReport("MOVED", undefined, "nifty50");
    if (asNifty.kind !== "ok") throw new Error(asNifty.kind);
    expect(asNifty.report.peerIndex.key).toBe("nifty50");
    expect(asNifty.report.defaultKey).toBe("bank");
  });

  test("a stock in none of its indices on the date falls back to the first it was ever in", async () => {
    const r = await stockReport("BLEFT"); // left Nifty Bank on d(200), never in the NIFTY 50
    if (r.kind !== "ok") throw new Error(r.kind);
    expect(r.report.defaultKey).toBe("bank");
    await db.insert(schema.indexMembers).values({ indexName: "NIFTY50", symbol: "BLEFT", addedOn: d(10), removedOn: d(20) });
    const both = await stockReport("BLEFT"); // in neither on the latest date: NIFTY 50 is first by registry
    if (both.kind !== "ok") throw new Error(both.kind);
    expect(both.report.defaultKey).toBe("nifty50");
  });

  test("cardExtra: the arrows and date picker keep `u` only when the peers aren't that date's default", async () => {
    const def = await stockReport("AAA"), bank = await stockReport("AAA", undefined, "bank"), bnk = await stockReport("BNK");
    if (def.kind !== "ok" || bank.kind !== "ok" || bnk.kind !== "ok") throw new Error("no report");
    expect(cardExtra(def.report, "1m")).toBe("&h=1m");
    expect(cardExtra(bank.report, "1m")).toBe("&h=1m&u=bank");
    expect(cardExtra(bnk.report, "1m")).toBe("&h=1m"); // Nifty Bank is BNK's default
    expect(cardExtra(bank.report, "1y")).toBe("&h=1y&u=bank");
  });

  test("the card's index tabs name `u` for every index but that date's default", () => {
    const html = (defaultKey?: string) => renderToString(createElement(IndexTabs, { base: "/stock/MOVED", current: NIFTY_BANK, ma: "sma200", only: ["nifty50", "bank"], defaultKey }));
    // a stock whose default is Nifty Bank: the NIFTY 50 tab must say so, the Bank tab needn't
    expect(html("bank")).toContain('href="/stock/MOVED?ma=sma200&amp;u=nifty50"');
    expect(html("bank")).toContain('href="/stock/MOVED?ma=sma200"');
    // every other page: the NIFTY 50 is the default, unchanged
    expect(html()).toContain('href="/stock/MOVED?ma=sma200&amp;u=bank"');
    expect(html()).not.toContain("u=nifty50");
  });

  test("the card says plainly that only Strength uses the Bank peers", async () => {
    const bank = await stockReport("BNK"), def = await stockReport("NFX");
    if (bank.kind !== "ok" || def.kind !== "ok") throw new Error("no report");
    expect(peersLine(bank.report)).toBe("Strength ranks it among Nifty Bank's members on that day. Every other check compares it with the NIFTY 50, the market.");
    expect(peersLine(def.report)).toBeNull();
  });
});
