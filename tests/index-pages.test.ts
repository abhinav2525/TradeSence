// Decision 0034: every page query, given Nifty Bank's membership name, counts only
// stocks that were in Nifty Bank on each date: a stock that left mid-window counts
// only before it left, one that joined only after, and NIFTY-50-only stocks never.
import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { NIFTY50, NIFTY_BANK } from "../src/ingest/indices";
import { breadthSeries, breakdownOn, adjacentSessions, resolveSession } from "../src/query/breadth";
import { advanceDeclineCounts } from "../src/query/advance-decline";
import { crossingStats } from "../src/query/crossings";
import { screenerOn } from "../src/query/screener";
import { activityOn } from "../src/query/activity";
import { pointInTime, cleanUniverse } from "../src/indicators/breadth-universes";
import { hotkeyTarget } from "../src/components/hotkey-target";

const D = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"] as const;
const BANK = NIFTY_BANK.members;

// closes against an average of 100: LEFT crosses on D[1]; NEWB joins on D[2].
const closes: Record<string, number[]> = {
  AAA: [105, 106, 107, 108],
  LEFT: [95, 103, 90, 110], // in Bank on D[0], D[1] only (removed_on D[2])
  NEWB: [90, 91, 110, 111], // in Bank from D[2]
  ZZZ: [80, 80, 80, 80, 80], // NIFTY 50 only, and the only stock with a row on D[4]
};

beforeEach(async () => {
  for (const t of [schema.dailyIndicators, schema.indexMembers, schema.unusualDays]) await db.delete(t);
  await db.insert(schema.indexMembers).values([
    { indexName: BANK, symbol: "AAA", addedOn: "2020-01-01", removedOn: null },
    { indexName: BANK, symbol: "LEFT", addedOn: "2020-01-01", removedOn: D[2] },
    { indexName: BANK, symbol: "NEWB", addedOn: D[2], removedOn: null },
    { indexName: NIFTY50.members, symbol: "AAA", addedOn: "2020-01-01", removedOn: null },
    { indexName: NIFTY50.members, symbol: "ZZZ", addedOn: "2020-01-01", removedOn: null },
  ]);
  await db.insert(schema.dailyIndicators).values(
    Object.entries(closes).flatMap(([symbol, cs]) =>
      cs.map((close, i) => ({
        tradeDate: D[i]!, symbol, close, sma50: 100, sma200: 100, ema200: 100,
        changePct: i === 0 ? null : close > cs[i - 1]! ? 1 : close < cs[i - 1]! ? -1 : 0, volRatio: 1,
      })),
    ),
  );
});

describe("Breadth on Nifty Bank's own membership", () => {
  test("each day counts only that day's members", async () => {
    const s = await breadthSeries("sma200", BANK);
    expect(s.map((p) => [p.date, p.above, p.total])).toEqual([
      [D[0], 1, 2], // AAA above, LEFT below
      [D[1], 2, 2], // LEFT above
      [D[2], 2, 2], // AAA, NEWB (LEFT gone)
      [D[3], 2, 2],
    ]);
  });

  test("the newest session is Nifty Bank's own, not the NIFTY 50's", async () => {
    expect(await resolveSession("sma200", undefined, BANK)).toBe(D[3]);
    const b = await breakdownOn("sma200", undefined, BANK);
    expect(b.date).toBe(D[3]);
    expect(b.above.map((r) => r.symbol).sort()).toEqual(["AAA", "NEWB"]);
    expect(await adjacentSessions("sma200", D[3], BANK)).toEqual({ prev: D[2], next: null });
  });

  test("a day the NIFTY 50 traded but Nifty Bank has no row snaps back to Nifty Bank's last session", async () => {
    // ZZZ (NIFTY 50 only) is the only stock with a row on D[4].
    expect(await resolveSession("sma200", D[4], BANK)).toBe(D[3]);
    expect((await breakdownOn("sma200", D[4], BANK)).date).toBe(D[3]);
  });

  test("a past day lists who was a member then", async () => {
    const b = await breakdownOn("sma200", D[0], BANK);
    expect(b.above.map((r) => r.symbol)).toEqual(["AAA"]);
    expect(b.below.map((r) => r.symbol)).toEqual(["LEFT"]);
  });
});

describe("the other pages on Nifty Bank", () => {
  test("Advance/Decline counts a leaver only before it left", async () => {
    const c = await advanceDeclineCounts(BANK);
    expect(c.find((r) => r.date === D[1])).toMatchObject({ advancing: 2, declining: 0, unchanged: 0 }); // AAA, LEFT up
    expect(c.find((r) => r.date === D[2])).toMatchObject({ advancing: 2, declining: 0, unchanged: 0 }); // AAA, NEWB up; LEFT's fall not counted
  });

  test("Crossings ranks Nifty Bank members only, each over its own time in the index", async () => {
    const s = await crossingStats("sma200", BANK);
    expect(s.map((r) => r.symbol).sort()).toEqual(["AAA", "LEFT", "NEWB"]);
    expect(s.find((r) => r.symbol === "LEFT")).toMatchObject({ sessions: 2, crossings: 1 });
    expect(s.find((r) => r.symbol === "NEWB")).toMatchObject({ sessions: 2, crossings: 0 });
  });

  test("the Screener reads that day's members", async () => {
    const r = await screenerOn("sma200", D[2], BANK);
    expect(r.rows.map((x) => x.symbol).sort()).toEqual(["AAA", "NEWB"]);
    expect(r.rows.find((x) => x.symbol === "NEWB")).toMatchObject({ cross: "above" });
  });

  test("Unusual activity's Nifty Bank switch uses membership on that date", async () => {
    const u = (tradeDate: string, symbol: string) => ({
      tradeDate, symbol, kept: false, volume: true, jump: false, collapse: false,
      keptRatio: 1, volumeRatio: 6, deliveryPct: 40, usualDeliveryPct: 40, changePct: 1, turnover: 2e7,
    });
    await db.insert(schema.unusualDays).values([u(D[1], "LEFT"), u(D[1], "ZZZ"), u(D[2], "LEFT"), u(D[2], "NEWB")]);
    expect((await activityOn(D[1], "bank")).map((r) => r.symbol)).toEqual(["LEFT"]);
    expect((await activityOn(D[2], "bank")).map((r) => r.symbol)).toEqual(["NEWB"]);
    expect((await activityOn(D[1], "nifty50")).map((r) => r.symbol)).toEqual(["ZZZ"]);
    expect((await activityOn(D[2], "all")).map((r) => r.symbol).sort()).toEqual(["LEFT", "NEWB"]);
  });

  test("on the Nifty Bank switch, every member of a registered index links to a Report Card (step B)", async () => {
    const u = (symbol: string) => ({
      tradeDate: D[2], symbol, kept: false, volume: true, jump: false, collapse: false,
      keptRatio: 1, volumeRatio: 6, deliveryPct: 40, usualDeliveryPct: 40, changePct: 1, turnover: 2e7,
    });
    await db.insert(schema.unusualDays).values([u("AAA"), u("NEWB")]); // AAA in both indices, NEWB Bank only
    const rows = await activityOn(D[2], "bank");
    expect(rows.find((r) => r.symbol === "AAA")).toMatchObject({ hasCard: true });
    expect(rows.find((r) => r.symbol === "NEWB")).toMatchObject({ hasCard: true });
  });
});

describe("which Breadth views use true membership", () => {
  test("bank and the NIFTY 50 do; a list with no membership file keeps today's list", () => {
    expect(pointInTime(cleanUniverse("bank"))).toBe(NIFTY_BANK);
    expect(pointInTime(cleanUniverse("nifty50"))).toBe(NIFTY50);
    expect(pointInTime(cleanUniverse(undefined))).toBe(NIFTY50);
    expect(pointInTime(cleanUniverse("private-bank"))).toBeNull();
    expect(pointInTime(cleanUniverse("financial-services"))).toBeNull();
    expect(pointInTime(cleanUniverse("market"))).toBeNull();
  });
});

describe("keys keep the chosen index on the page, not across pages (owner, 2026-10-05)", () => {
  const ctx = { page: "crossings" as const, ma: "sma200", prev: D[0], next: D[2], extra: "&u=bank" };
  test("arrows and 1-3 keep u", () => {
    expect(hotkeyTarget("ArrowLeft", ctx)).toBe(`/crossings?ma=sma200&date=${D[0]}&u=bank`);
    expect(hotkeyTarget("3", ctx)).toBe("/crossings?ma=sma50&u=bank");
  });
  test("cross-page keys open the NIFTY 50 view", () => {
    expect(hotkeyTarget("a", ctx)).toBe("/advance-decline?ma=sma200");
    expect(hotkeyTarget("b", ctx)).toBe("/?ma=sma200");
  });
});
