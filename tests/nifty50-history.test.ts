import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { fetchNifty50Symbols } from "../src/ingest/nifty50";
import {
  parseMembershipHistory, membersOn, validateMembershipHistory, readMembershipHistory,
  loadNifty50History, membershipDrift, HISTORY_START,
} from "../src/ingest/nifty50-history";
import { resolveSession, adjacentSessions } from "../src/query/breadth";

const HEADER = "symbol,added_on,removed_on,listed_as,source\n";

describe("parseMembershipHistory", () => {
  test("reads rows, skipping comments, with blank removed_on meaning still a member", () => {
    const rows = parseMembershipHistory(
      "# a comment\n" + HEADER +
      "YESBANK,2020-01-01,2020-03-27,,start\n" +
      "ETERNAL,2025-03-28,,ZOMATO,added x\n",
    );
    expect(rows).toEqual([
      { symbol: "YESBANK", addedOn: "2020-01-01", removedOn: "2020-03-27", listedAs: null, source: "start" },
      { symbol: "ETERNAL", addedOn: "2025-03-28", removedOn: null, listedAs: "ZOMATO", source: "added x" },
    ]);
  });

  test("refuses a row it cannot trust instead of skipping it", () => {
    expect(() => parseMembershipHistory(HEADER + "X,2020-13-01,,,s\n")).toThrow();
    expect(() => parseMembershipHistory(HEADER + "X,2021-01-01,2020-01-01,,s\n")).toThrow();
    expect(() => parseMembershipHistory("wrong,header\nX,2020-01-01,,,s\n")).toThrow();
  });
});

const r = (symbol: string, addedOn: string, removedOn: string | null = null) =>
  ({ symbol, addedOn, removedOn, listedAs: null, source: "" });

describe("membersOn", () => {
  test("counts the added day and excludes the removal day", () => {
    const rows = [r("A", "2020-01-01", "2020-03-27"), r("B", "2020-03-27")];
    expect(membersOn(rows, "2020-03-26")).toEqual(["A"]);
    expect(membersOn(rows, "2020-03-27")).toEqual(["B"]);
  });
});

describe("membershipDrift", () => {
  test("names what NSE added and removed that the file does not know about yet", () => {
    const rows = [r("WIPRO", "2020-01-01"), r("TCS", "2020-01-01")];
    expect(membershipDrift(rows, ["TCS", "BSE"], "2026-10-02"))
      .toEqual({ added: ["BSE"], removed: ["WIPRO"] });
  });

  test("no drift when they agree", () => {
    expect(membershipDrift([r("TCS", "2020-01-01")], ["TCS"], "2026-10-02"))
      .toEqual({ added: [], removed: [] });
  });
});

describe("validateMembershipHistory", () => {
  const fifty = (prefix: string) => Array.from({ length: 50 }, (_, i) => r(`${prefix}${i}`, "2020-01-01"));

  test("a history with exactly 50 members throughout is valid", () => {
    expect(validateMembershipHistory(fifty("S"), 50)).toEqual([]);
  });

  test("reports any day the count is not 50", () => {
    const rows = fifty("S");
    rows[0] = r("S0", "2020-01-01", "2021-06-30"); // removed, nobody added
    expect(validateMembershipHistory(rows, 50)).toEqual(["2021-06-30: 49 members"]);
  });

  test("reports a stock listed twice at the same time", () => {
    const rows = [...fifty("S").slice(1), r("S1", "2020-06-01")];
    expect(validateMembershipHistory(rows, 50)).toContain("S1: overlapping periods");
  });
});

// The committed file is data, and data gets checked like code.
describe("the committed NIFTY 50 history", () => {
  const rows = readMembershipHistory();

  test("has exactly 50 members on every day since the start", () => {
    expect(validateMembershipHistory(rows, 50)).toEqual([]);
    expect(membersOn(rows, HISTORY_START)).toHaveLength(50);
  });

  test("matches known changes", () => {
    expect(membersOn(rows, "2020-03-26")).toContain("YESBANK");
    expect(membersOn(rows, "2020-03-27")).not.toContain("YESBANK");
    expect(membersOn(rows, "2023-07-12")).toContain("HDFC");
    expect(membersOn(rows, "2023-07-13")).toContain("LTM"); // LTIMindtree, then LTIM
  });

  // Live: if this fails, NSE has changed the index and the file needs a new row.
  test("today's members are exactly NSE's published list", async () => {
    const live = (await fetchNifty50Symbols()).sort();
    expect(membersOn(rows, new Date().toISOString().slice(0, 10)).sort()).toEqual(live);
  }, 30000);
});

describe("loadNifty50History", () => {
  beforeEach(async () => {
    await db.delete(schema.dailyIndicators);
    await db.delete(schema.indexMembers);
  });

  test("replaces the membership table with the file, and is idempotent", async () => {
    await db.insert(schema.indexMembers).values(
      { indexName: "NIFTY50", symbol: "OLDSEED", addedOn: "2016-09-01", removedOn: null },
    );
    const n = await loadNifty50History();
    await loadNifty50History();
    const stored = await db.select().from(schema.indexMembers);
    expect(stored).toHaveLength(n);
    expect(stored.find((m) => m.symbol === "OLDSEED")).toBeUndefined();
    expect(stored.find((m) => m.symbol === "YESBANK"))
      .toMatchObject({ addedOn: "2020-01-01", removedOn: "2020-03-27" });
  });

  test("refuses to load a history that is not 50 members throughout", async () => {
    await expect(loadNifty50History(HEADER + "ONLYONE,2020-01-01,,,s\n")).rejects.toThrow(/members/);
    expect(await db.select().from(schema.indexMembers)).toHaveLength(0);
  });
});

describe("date navigation only offers days with members", () => {
  beforeEach(async () => {
    await db.delete(schema.dailyIndicators);
    await db.delete(schema.indexMembers);
  });

  test("a day before the membership history starts is not a session", async () => {
    await db.insert(schema.indexMembers).values(
      { indexName: "NIFTY50", symbol: "A", addedOn: "2020-01-01", removedOn: null },
    );
    await db.insert(schema.dailyIndicators).values([
      { tradeDate: "2019-12-31", symbol: "A", close: 1, sma50: 1, sma200: 1, ema200: 1 },
      { tradeDate: "2020-01-02", symbol: "A", close: 1, sma50: 1, sma200: 1, ema200: 1 },
    ]);
    expect(await resolveSession("sma200", "2019-12-31")).toBeNull();
    expect(await adjacentSessions("sma200", "2020-01-02")).toEqual({ prev: null, next: null });
  });
});
