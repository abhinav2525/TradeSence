import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { activitySession, activityNeighbours, activityOn, filterKinds, kindCounts, recentUnusual } from "../src/query/activity";

const row = (tradeDate: string, symbol: string, p: Partial<typeof schema.unusualDays.$inferInsert> = {}) => ({
  tradeDate, symbol, kept: false, volume: true, jump: false, collapse: false,
  keptRatio: 1, volumeRatio: 6, deliveryPct: 40, usualDeliveryPct: 40, changePct: 1, turnover: 2e7, ...p,
});

beforeEach(async () => {
  for (const t of [schema.unusualDays, schema.indexMembers]) await db.delete(t);
  await db.insert(schema.unusualDays).values([
    row("2026-09-29", "AAA", { volumeRatio: 10 }),
    row("2026-09-29", "BBB", { kept: true, keptRatio: 20, volume: false, volumeRatio: 2 }),
    row("2026-09-30", "AAA"),
    row("2026-10-01", "CCC", { jump: true, deliveryPct: 90, usualDeliveryPct: 40, volume: false, volumeRatio: 1 }),
  ]);
  await db.insert(schema.indexMembers).values([
    { indexName: "NIFTY50", symbol: "AAA", addedOn: "2020-01-01", removedOn: "2026-09-30" },
  ]);
});

describe("sessions", () => {
  test("latest session, or the last one on or before a date", async () => {
    expect(await activitySession()).toBe("2026-10-01");
    expect(await activitySession("2026-09-30")).toBe("2026-09-30");
    expect(await activitySession("2026-09-28")).toBeNull();
  });
  test("neighbours", async () => {
    expect(await activityNeighbours("2026-09-30")).toEqual({ prev: "2026-09-29", next: "2026-10-01" });
  });
});

describe("activityOn", () => {
  test("sorted by how unusual: BBB (20× kept = 4) before AAA (10× volume = 2)", async () => {
    expect((await activityOn("2026-09-29", "all")).map((r) => r.symbol)).toEqual(["BBB", "AAA"]);
  });
  test("NIFTY 50 switch uses membership on that date", async () => {
    expect((await activityOn("2026-09-29", "nifty50")).map((r) => r.symbol)).toEqual(["AAA"]);
    expect(await activityOn("2026-09-30", "nifty50")).toEqual([]); // AAA left on 2026-09-30
    expect((await activityOn("2026-09-29", "all")).find((r) => r.symbol === "AAA")?.member).toBe(true);
  });
  test("kind counts and filter", async () => {
    const rows = await activityOn("2026-09-29", "all");
    expect(kindCounts(rows)).toEqual({ kept: 1, volume: 1, jump: 0, collapse: 0 });
    expect(filterKinds(rows, ["kept"]).map((r) => r.symbol)).toEqual(["BBB"]);
  });
});

describe("recentUnusual", () => {
  test("a stock's unusual days in the last 92 days up to a date, newest first", async () => {
    expect((await recentUnusual("AAA", "2026-10-01")).map((r) => r.tradeDate)).toEqual(["2026-09-30", "2026-09-29"]);
    expect(await recentUnusual("AAA", "2026-09-28")).toEqual([]);
  });
});
