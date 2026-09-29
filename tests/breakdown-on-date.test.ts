import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { breakdownOn, latestBreakdown, adjacentSessions, resolveSession } from "../src/query/breadth";

// Three sessions: Wed 2020-01-01, Thu 01-02, Fri 01-03. No weekend rows,
// so 2020-01-04 (Sat) and 2020-01-05 (Sun) must snap back to Friday.
const SESSIONS = ["2020-01-01", "2020-01-02", "2020-01-03"];

async function seed() {
  await db.delete(schema.dailyIndicators);
  await db.delete(schema.indexMembers);
  await db.insert(schema.indexMembers).values([
    { indexName: "NIFTY50", symbol: "AAA", addedOn: "2019-01-01", removedOn: null },
    { indexName: "NIFTY50", symbol: "BBB", addedOn: "2019-01-01", removedOn: null },
  ]);
  const rows = [];
  // AAA above on day 1 only; BBB below throughout
  for (const [i, d] of SESSIONS.entries()) {
    rows.push({ tradeDate: d, symbol: "AAA", close: i === 0 ? 120 : 80, sma50: 100, sma200: 100, ema200: 100 });
    rows.push({ tradeDate: d, symbol: "BBB", close: 90, sma50: 100, sma200: 100, ema200: 100 });
  }
  await db.insert(schema.dailyIndicators).values(rows);
}

describe("resolveSession", () => {
  beforeEach(seed);

  test("returns the latest session when no date is given", async () => {
    expect(await resolveSession("sma200")).toBe("2020-01-03");
  });

  test("returns the date itself when it is a trading session", async () => {
    expect(await resolveSession("sma200", "2020-01-02")).toBe("2020-01-02");
  });

  test("snaps a weekend back to the previous session", async () => {
    expect(await resolveSession("sma200", "2020-01-05")).toBe("2020-01-03");
  });

  test("clamps a date beyond the data to the latest session", async () => {
    expect(await resolveSession("sma200", "2030-01-01")).toBe("2020-01-03");
  });

  test("returns null for a date before any data exists", async () => {
    expect(await resolveSession("sma200", "2010-01-01")).toBeNull();
  });
});

describe("breakdownOn", () => {
  beforeEach(seed);

  test("returns the lists for the requested session", async () => {
    const out = await breakdownOn("sma200", "2020-01-01");
    expect(out.date).toBe("2020-01-01");
    expect(out.above.map((r) => r.symbol)).toEqual(["AAA"]);
    expect(out.below.map((r) => r.symbol)).toEqual(["BBB"]);
  });

  test("a later session shows a different split", async () => {
    const out = await breakdownOn("sma200", "2020-01-03");
    expect(out.above).toHaveLength(0);
    expect(out.below.map((r) => r.symbol).sort()).toEqual(["AAA", "BBB"]);
  });

  test("reports when the requested date was snapped", async () => {
    const out = await breakdownOn("sma200", "2020-01-05");
    expect(out.date).toBe("2020-01-03");
    expect(out.requested).toBe("2020-01-05");
    expect(out.snapped).toBe(true);
  });

  test("does not flag a snap when the date is an actual session", async () => {
    const out = await breakdownOn("sma200", "2020-01-02");
    expect(out.snapped).toBe(false);
  });

  test("with no date behaves exactly like latestBreakdown", async () => {
    const a = await breakdownOn("sma200");
    const b = await latestBreakdown("sma200");
    expect(a.date).toBe(b.date);
    expect(a.below.map((r) => r.symbol)).toEqual(b.below.map((r) => r.symbol));
  });
});

describe("adjacentSessions", () => {
  beforeEach(seed);

  test("finds the sessions either side", async () => {
    expect(await adjacentSessions("sma200", "2020-01-02")).toEqual({
      prev: "2020-01-01", next: "2020-01-03",
    });
  });

  test("has no previous session at the start of history", async () => {
    expect((await adjacentSessions("sma200", "2020-01-01")).prev).toBeNull();
  });

  test("has no next session at the end of history", async () => {
    expect((await adjacentSessions("sma200", "2020-01-03")).next).toBeNull();
  });
});
