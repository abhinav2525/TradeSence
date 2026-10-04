import { test, expect, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { universeSeries } from "../src/query/breadth";

beforeEach(async () => { await db.delete(schema.breadthDaily); });

test("universeSeries: one universe and average, oldest first, with the share above", async () => {
  await db.insert(schema.breadthDaily).values([
    { universe: "market", ma: "sma200", tradeDate: "2026-09-30", above: 30, total: 120 },
    { universe: "market", ma: "sma200", tradeDate: "2026-09-29", above: 60, total: 120 },
    { universe: "market", ma: "sma50", tradeDate: "2026-09-30", above: 1, total: 2 },
    { universe: "bank", ma: "sma200", tradeDate: "2026-09-30", above: 9, total: 12 },
  ]);
  const s = await universeSeries("market", "sma200");
  expect(s.map((p) => [p.date, p.above, p.below, p.total, p.pctAbove])).toEqual([
    ["2026-09-29", 60, 60, 120, 50], ["2026-09-30", 30, 90, 120, 25],
  ]);
  expect(await universeSeries("midcap-150", "sma200")).toEqual([]);
});
