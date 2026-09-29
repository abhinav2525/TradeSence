import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { crossingStats } from "../src/query/crossings";

type Row = typeof schema.dailyIndicators.$inferInsert;

/** Builds sessions on consecutive days from a start date. */
function series(symbol: string, start: string, closes: (number | null)[]): Row[] {
  return closes.map((close, i) => {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return {
      tradeDate: d.toISOString().slice(0, 10),
      symbol,
      close: close ?? 100,
      sma50: close === null ? null : 100,
      sma200: close === null ? null : 100,
      ema200: close === null ? null : 100,
    };
  });
}

const member = (symbol: string) => ({
  indexName: "NIFTY50", symbol, addedOn: "2000-01-01", removedOn: null,
});

async function seed(rows: Row[], symbols: string[]) {
  await db.delete(schema.dailyIndicators);
  await db.delete(schema.indexMembers);
  await db.insert(schema.indexMembers).values(symbols.map(member));
  await db.insert(schema.dailyIndicators).values(rows);
}

describe("crossingStats", () => {
  beforeEach(async () => {
    await db.delete(schema.dailyIndicators);
    await db.delete(schema.indexMembers);
  });

  test("counts every flip across the average", async () => {
    // 110 90 110 90 110 90 against an average of 100 => 5 flips
    await seed(series("OSC", "2020-01-01", [110, 90, 110, 90, 110, 90]), ["OSC"]);
    const [s] = await crossingStats("sma200");
    expect(s!.symbol).toBe("OSC");
    expect(s!.crossings).toBe(5);
    expect(s!.sessions).toBe(6);
  });

  test("reports zero crossings for a stock that never leaves one side", async () => {
    await seed(series("STEADY", "2020-01-01", [110, 111, 112, 113]), ["STEADY"]);
    const [s] = await crossingStats("sma200");
    expect(s!.crossings).toBe(0);
    expect(s!.currentState).toBe("above");
    expect(s!.lastCrossing).toBeNull();
    expect(s!.daysInCurrentRun).toBe(4);
  });

  test("does not invent a crossing across a hole in the history", async () => {
    // three sessions above in January, three below in June: the jump between
    // them is a data gap, not the price crossing anything.
    const rows = [
      ...series("GAPPED", "2020-01-01", [110, 111, 112]),
      ...series("GAPPED", "2020-06-01", [90, 91, 92]),
    ];
    await seed(rows, ["GAPPED"]);
    const [s] = await crossingStats("sma200");
    expect(s!.crossings).toBe(0);
    expect(s!.currentState).toBe("below");
  });

  test("ignores sessions where the average is not yet available", async () => {
    // first two sessions have a null average (window still filling)
    const rows = series("WARMUP", "2020-01-01", [null, null, 110, 90]);
    await seed(rows, ["WARMUP"]);
    const [s] = await crossingStats("sma200");
    expect(s!.sessions).toBe(2);
    expect(s!.crossings).toBe(1);
  });

  test("reports the date of the most recent crossing and the run length since", async () => {
    await seed(series("RUN", "2020-01-01", [110, 110, 90, 90, 90]), ["RUN"]);
    const [s] = await crossingStats("sma200");
    expect(s!.crossings).toBe(1);
    expect(s!.lastCrossing).toBe("2020-01-03");
    expect(s!.currentState).toBe("below");
    expect(s!.daysInCurrentRun).toBe(3);
  });

  test("orders the busiest crossers first", async () => {
    const rows = [
      ...series("CHOPPY", "2020-01-01", [110, 90, 110, 90]),
      ...series("CALM", "2020-01-01", [110, 111, 112, 113]),
    ];
    await seed(rows, ["CHOPPY", "CALM"]);
    const stats = await crossingStats("sma200");
    expect(stats.map((s) => s.symbol)).toEqual(["CHOPPY", "CALM"]);
  });

  test("excludes symbols that are not index members", async () => {
    await db.insert(schema.indexMembers).values([member("IN")]);
    await db.insert(schema.dailyIndicators).values([
      ...series("IN", "2020-01-01", [110, 90]),
      ...series("OUT", "2020-01-01", [110, 90]),
    ]);
    const stats = await crossingStats("sma200");
    expect(stats.map((s) => s.symbol)).toEqual(["IN"]);
  });

  test("works against the 50-day average too", async () => {
    await seed(series("OSC", "2020-01-01", [110, 90, 110]), ["OSC"]);
    const [s] = await crossingStats("sma50");
    expect(s!.crossings).toBe(2);
  });
});
