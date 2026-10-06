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
