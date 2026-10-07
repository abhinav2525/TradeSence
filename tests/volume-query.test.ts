import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { sectorsPresent, topVolume } from "../src/query/volume";

beforeEach(async () => {
  for (const t of [schema.volumeLeaders, schema.indexConstituents, schema.indexMembers]) await db.delete(t);
  const c = (indexKey: string, symbol: string, industry = "Financial Services") => ({ indexKey, symbol, industry, fetchedOn: "2026-10-01" });
  await db.insert(schema.indexConstituents).values([
    c("total-market", "BIGBANK"), c("total-market", "SMALLIT", "Information Technology"), c("total-market", "MIDBANK"),
    c("nifty-100", "BIGBANK"), c("smallcap-250", "SMALLIT"), c("midcap-150", "MIDBANK"), c("bank", "BIGBANK"), c("bank", "MIDBANK"),
  ]);
  const v = (symbol: string, turnover: number, shares: number) => ({ asOf: "2026-10-01", symbol, period: 21, turnover, shares, changePct: 1, sessions: 21, unusualDays: 0 });
  await db.insert(schema.volumeLeaders).values([v("BIGBANK", 900, 10), v("SMALLIT", 100, 500), v("MIDBANK", 300, 50)]);
  await db.insert(schema.indexMembers).values([
    { indexName: "NIFTY50", symbol: "BIGBANK", addedOn: "2020-01-01", removedOn: null },
    { indexName: "NIFTYBANK", symbol: "MIDBANK", addedOn: "2020-01-01", removedOn: null },
  ]);
});
const base = { period: 21 as const, rank: "value" as const, size: null, sector: null, indexKey: null };

describe("topVolume", () => {
  test("ranks by ₹ value, or by shares", async () => {
    expect((await topVolume(base)).rows.map((r) => r.symbol)).toEqual(["BIGBANK", "MIDBANK", "SMALLIT"]);
    expect((await topVolume({ ...base, rank: "shares" })).rows.map((r) => r.symbol)).toEqual(["SMALLIT", "MIDBANK", "BIGBANK"]);
  });
  test("size, sector and index filters, alone and together", async () => {
    expect((await topVolume({ ...base, size: "small" })).rows.map((r) => r.symbol)).toEqual(["SMALLIT"]);
    expect((await topVolume({ ...base, sector: "Financial Services" })).rows.map((r) => r.symbol)).toEqual(["BIGBANK", "MIDBANK"]);
    expect((await topVolume({ ...base, indexKey: "bank", size: "mid" })).rows.map((r) => r.symbol)).toEqual(["MIDBANK"]);
  });
  test("carries sector, size and the Report Card link", async () => {
    const big = (await topVolume(base)).rows[0]!;
    expect(big).toMatchObject({ sector: "Financial Services", size: "large", hasCard: true });
    expect((await topVolume(base)).asOf).toBe("2026-10-01");
  });
  test("a Nifty-Bank-only stock links to its Report Card (step B: every registered index's members)", async () => {
    const mid = (await topVolume(base)).rows.find((r) => r.symbol === "MIDBANK")!;
    expect(mid.hasCard).toBe(true);
    expect((await topVolume(base)).rows.find((r) => r.symbol === "SMALLIT")!.hasCard).toBe(false);
  });
  test("sectors present in the universe", async () => {
    expect(await sectorsPresent()).toEqual(["Financial Services", "Information Technology"]);
  });
});

import { pageOfRows, PAGE_SIZE } from "../src/query/volume";
test("the leaderboard pages through 100 rows at a time", () => {
  const rows = Array.from({ length: 250 }, (_, i) => i);
  expect(PAGE_SIZE).toBe(100);
  expect(pageOfRows(rows, 1)).toEqual({ rows: rows.slice(0, 100), page: 1, pages: 3, first: 1 });
  expect(pageOfRows(rows, 3)).toEqual({ rows: rows.slice(200), page: 3, pages: 3, first: 201 });
  expect(pageOfRows(rows, 9).page).toBe(3); // past the end: the last page
  expect(pageOfRows([], 1)).toEqual({ rows: [], page: 1, pages: 1, first: 1 });
});

import { withReportCard } from "../src/query/money-flow";

describe("withReportCard (Money flow drill-down)", () => {
  test("a member of any registered index has a card; other stocks don't", async () => {
    expect(await withReportCard(["BIGBANK", "MIDBANK", "SMALLIT"])).toEqual(new Set(["BIGBANK", "MIDBANK"]));
  });
});

// ── "Unusually busy" (spec 2026-10-07) ──
import { BUSY_FLOOR_RS, cleanRank, rankLeaders } from "../src/query/volume";

describe("cleanRank", () => {
  test("exactly 'shares' or 'busy', else ₹ value; busy only on 1 day, 1 week, 1 month", () => {
    expect(cleanRank("shares", 21)).toBe("shares");
    expect(cleanRank("busy", 1)).toBe("busy");
    expect(cleanRank("busy", 5)).toBe("busy");
    expect(cleanRank("busy", 21)).toBe("busy");
    expect(cleanRank("busy", 63)).toBe("value");
    expect(cleanRank("busy", 126)).toBe("value");
    for (const v of [undefined, "", "BUSY", "Busy", "busy ", "value", "x"]) expect(cleanRank(v, 5)).toBe("value");
  });
});

describe("rankLeaders: the busy sort and its floor", () => {
  const r = (symbol: string, turnover: number, normalDaily: number | null) => ({ symbol, turnover, shares: 1, normalDaily });
  test("× normal = ₹ ÷ (normal × period), never the sessions the stock traded", () => {
    const [x] = rankLeaders([{ ...r("A", 30e8, 1e8), sessions: 3 }], "value", 5).rows;
    expect(x!.busyRatio!).toBeCloseTo(6, 9);
    expect(rankLeaders([r("B", 1, null)], "value", 5).rows[0]!.busyRatio).toBeNull();
  });
  test("a normal of exactly ₹5 crore is ranked; one rupee under is not, and is counted as left out", () => {
    expect(BUSY_FLOOR_RS).toBe(5e7);
    const rows = [r("AT", 5 * 5e7 * 3, BUSY_FLOOR_RS), r("UNDER", 5 * (5e7 - 1) * 9, BUSY_FLOOR_RS - 1), r("NEW", 9e9, null), r("BIG", 5 * 1e9 * 2, 1e9)];
    const out = rankLeaders(rows, "busy", 5);
    expect(out.rows.map((x) => x.symbol)).toEqual(["AT", "BIG"]);
    expect(out.leftOut).toBe(2);
  });
  test("ties by symbol; ₹ and Shares rankings keep everyone and leave nobody out", () => {
    const rows = [r("Z", 10e8, 1e8), r("A", 10e8, 1e8), r("TINY", 1e6, 1e4)];
    expect(rankLeaders(rows, "busy", 1).rows.map((x) => x.symbol)).toEqual(["A", "Z"]);
    expect(rankLeaders(rows, "value", 1)).toMatchObject({ leftOut: 0 });
    expect(rankLeaders(rows, "value", 1).rows.map((x) => x.symbol)).toEqual(["A", "Z", "TINY"]);
  });
});

describe("topVolume, rank by busy", () => {
  beforeEach(async () => {
    await db.delete(schema.volumeLeaders);
    const v = (symbol: string, turnover: number, normalDaily: number | null) =>
      ({ asOf: "2026-10-01", symbol, period: 5, turnover, shares: 1, changePct: 1, sessions: 5, unusualDays: 0, normalDaily });
    await db.insert(schema.volumeLeaders).values([
      v("BIGBANK", 5 * 1e9 * 1.2, 1e9), // 1.2×
      v("MIDBANK", 5 * 6e7 * 3, 6e7), // 3×
      v("SMALLIT", 5 * 1e7 * 20, 1e7), // 20×, but trades ₹1 crore a day: under the floor
    ]);
  });
  const busy = { period: 5 as const, rank: "busy" as const, size: null, sector: null, indexKey: null };
  test("sorted by × normal; the left-out count comes with the rows", async () => {
    const out = await topVolume(busy);
    expect(out.rows.map((r) => r.symbol)).toEqual(["MIDBANK", "BIGBANK"]);
    expect(out.rows[0]!.busyRatio!).toBeCloseTo(3, 9);
    expect(out.leftOut).toBe(1);
  });
  test("filters apply before the floor: the left-out count is within the filter", async () => {
    const fin = await topVolume({ ...busy, sector: "Financial Services" });
    expect(fin.rows.map((r) => r.symbol)).toEqual(["MIDBANK", "BIGBANK"]);
    expect(fin.leftOut).toBe(0);
    const it = await topVolume({ ...busy, sector: "Information Technology" });
    expect(it.rows).toEqual([]);
    expect(it.leftOut).toBe(1);
  });
  test("the ₹ ranking still shows × normal for a stock under the floor", async () => {
    const rows = (await topVolume({ ...busy, rank: "value" })).rows;
    expect(rows.find((r) => r.symbol === "SMALLIT")!.busyRatio!).toBeCloseTo(20, 9);
  });
});

import { shortSessionsIn } from "../src/query/money-flow";
describe("shortSessionsIn (Top volume's short-session note, any period)", () => {
  test("a short session 40 market sessions back is inside 3 months, not inside 1 week", async () => {
    for (const t of [schema.ingestLog, schema.shortSessions]) await db.delete(t);
    const days: string[] = [];
    const d = new Date("2026-05-01T00:00:00Z");
    while (days.length < 70) { if (d.getUTCDay() % 6 !== 0) days.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
    await db.insert(schema.ingestLog).values(days.map((x) => ({ tradeDate: x, source: "bhavcopy", status: "ok", format: "udiff", rowCount: 1 })));
    const muhurat = days[days.length - 40]!;
    await db.insert(schema.shortSessions).values({ tradeDate: muhurat, marketTurnover: 1, usualTurnover: 10 });
    expect(await shortSessionsIn(63)).toEqual([muhurat]);
    expect(await shortSessionsIn(5)).toEqual([]);
  });
});
