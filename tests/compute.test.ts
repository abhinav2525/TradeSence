import { test, expect, describe, beforeEach } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { computeIndicators } from "../src/indicators/compute";
import { sma, ema } from "../src/indicators/moving-average";

/** 260 synthetic sessions for one symbol: a clean ramp, easy to verify by hand. */
function synthetic(symbol: string, n: number) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2020, 0, 1));
    d.setUTCDate(d.getUTCDate() + i);
    const close = 100 + i;
    rows.push({
      tradeDate: d.toISOString().slice(0, 10),
      symbol, series: "EQ",
      open: close, high: close, low: close, close, prevClose: close,
      volume: 1000, turnover: close * 1000,
    });
  }
  return rows;
}

describe("computeIndicators", () => {
  beforeEach(async () => {
    await db.delete(schema.dailyIndicators);
    await db.delete(schema.dailyPrices);
    await db.delete(schema.indexMembers);
  });

  test("writes one indicator row per price row for index members", async () => {
    const rows = synthetic("TESTCO", 260);
    await db.insert(schema.dailyPrices).values(rows);
    await db.insert(schema.indexMembers).values({
      indexName: "NIFTY50", symbol: "TESTCO", addedOn: "2020-01-01", removedOn: null,
    });

    const written = await computeIndicators();
    expect(written).toBe(260);

    const out = await db.select().from(schema.dailyIndicators);
    expect(out).toHaveLength(260);
  }, 30000);

  test("matches the pure sma/ema functions on the same series", async () => {
    const rows = synthetic("TESTCO", 260);
    await db.insert(schema.dailyPrices).values(rows);
    await db.insert(schema.indexMembers).values({
      indexName: "NIFTY50", symbol: "TESTCO", addedOn: "2020-01-01", removedOn: null,
    });
    await computeIndicators();

    const closes = rows.map((r) => r.close);
    const expectedSma200 = sma(closes, 200);
    const expectedEma200 = ema(closes, 200);
    const expectedSma50 = sma(closes, 50);
    const lastDate = rows[259]!.tradeDate;

    const [got] = await db
      .select()
      .from(schema.dailyIndicators)
      .where(and(
        eq(schema.dailyIndicators.symbol, "TESTCO"),
        eq(schema.dailyIndicators.tradeDate, lastDate),
      ));

    expect(got!.sma200!).toBeCloseTo(expectedSma200[259]!, 6);
    expect(got!.ema200!).toBeCloseTo(expectedEma200[259]!, 6);
    expect(got!.sma50!).toBeCloseTo(expectedSma50[259]!, 6);
  }, 30000);

  test("leaves the long averages null before the window fills", async () => {
    const rows = synthetic("TESTCO", 260);
    await db.insert(schema.dailyPrices).values(rows);
    await db.insert(schema.indexMembers).values({
      indexName: "NIFTY50", symbol: "TESTCO", addedOn: "2020-01-01", removedOn: null,
    });
    await computeIndicators();

    const [early] = await db
      .select()
      .from(schema.dailyIndicators)
      .where(and(
        eq(schema.dailyIndicators.symbol, "TESTCO"),
        eq(schema.dailyIndicators.tradeDate, rows[10]!.tradeDate),
      ));
    expect(early!.sma200).toBeNull();
    expect(early!.ema200).toBeNull();
    expect(early!.sma50).toBeNull();
  }, 30000);

  test("is idempotent: recomputing leaves the same number of rows", async () => {
    const rows = synthetic("TESTCO", 260);
    await db.insert(schema.dailyPrices).values(rows);
    await db.insert(schema.indexMembers).values({
      indexName: "NIFTY50", symbol: "TESTCO", addedOn: "2020-01-01", removedOn: null,
    });
    await computeIndicators();
    await computeIndicators();
    const out = await db.select().from(schema.dailyIndicators);
    expect(out).toHaveLength(260);
  }, 45000);
});

describe("computeIndicators across a rename", () => {
  // OLDNAME trades for 230 days, then the company becomes NEWNAME. The member
  // list knows only NEWNAME — before the fix, its history began at the rename.
  function renamed() {
    return synthetic("X", 260).map((r, i) => ({ ...r, symbol: i < 230 ? "OLDNAME" : "NEWNAME" }));
  }

  beforeEach(async () => {
    await db.delete(schema.dailyIndicators);
    await db.delete(schema.dailyPrices);
    await db.delete(schema.indexMembers);
    await db.delete(schema.corporateActions);
    await db.delete(schema.symbolChanges);
  });

  async function load() {
    const rows = renamed();
    await db.insert(schema.dailyPrices).values(rows);
    await db.insert(schema.indexMembers).values({
      indexName: "NIFTY50", symbol: "NEWNAME", addedOn: "2020-01-01", removedOn: null,
    });
    await db.insert(schema.symbolChanges).values({
      oldSymbol: "OLDNAME", newSymbol: "NEWNAME", changedOn: rows[230]!.tradeDate, company: "Co Ltd",
    });
    return rows;
  }

  test("the history before the rename is used, under today's symbol", async () => {
    const rows = await load();
    await computeIndicators();
    const out = await db.select().from(schema.dailyIndicators)
      .where(eq(schema.dailyIndicators.symbol, "NEWNAME"));
    expect(out).toHaveLength(260);

    const closes = rows.map((r) => r.close);
    const [last] = out.filter((r) => r.tradeDate === rows[259]!.tradeDate);
    expect(last!.sma200!).toBeCloseTo(sma(closes, 200)[259]!, 6);
    expect(last!.ema200!).toBeCloseTo(ema(closes, 200)[259]!, 6);
  }, 30000);

  test("a split NSE files under the new symbol still adjusts the old symbol's prices", async () => {
    const rows = (await load()).map((r) => r); // prices: 100..359, a ramp
    // Make day 100 a 1:2 split while the company was still OLDNAME.
    await db.delete(schema.dailyPrices);
    await db.insert(schema.dailyPrices).values(
      rows.map((r, i) => (i < 100 ? { ...r, close: r.close * 2 } : r)),
    );
    await db.insert(schema.corporateActions).values({
      symbol: "NEWNAME", exDate: rows[100]!.tradeDate, series: "EQ", subject: "Bonus 1:1",
      kind: "bonus", factor: 2, company: "Co Ltd", recordDate: null,
    });
    const jumps: unknown[] = [];
    await computeIndicators("NIFTY50", { onUnexplainedJump: (j) => jumps.push(j) });
    expect(jumps).toEqual([]);

    const [last] = await db.select().from(schema.dailyIndicators).where(and(
      eq(schema.dailyIndicators.symbol, "NEWNAME"),
      eq(schema.dailyIndicators.tradeDate, rows[259]!.tradeDate),
    ));
    expect(last!.sma200!).toBeCloseTo(sma(rows.map((r) => r.close), 200)[259]!, 6);
  }, 30000);
});

describe("computeIndicators across a demerger", () => {
  // Flat at 100; on day 230 a business is spun off and the stock opens at 60.
  function demerged() {
    return synthetic("DEMCO", 260).map((r, i) => {
      const close = i < 230 ? 100 : 60;
      return { ...r, open: close, high: close, low: close, close, prevClose: close };
    });
  }

  beforeEach(async () => {
    await db.delete(schema.dailyIndicators);
    await db.delete(schema.dailyPrices);
    await db.delete(schema.indexMembers);
    await db.delete(schema.corporateActions);
    await db.delete(schema.symbolChanges);
  });

  test("averages are adjusted by the price-derived ratio and nothing is flagged", async () => {
    const rows = demerged();
    await db.insert(schema.dailyPrices).values(rows);
    await db.insert(schema.indexMembers).values({
      indexName: "NIFTY50", symbol: "DEMCO", addedOn: "2020-01-01", removedOn: null,
    });
    await db.insert(schema.corporateActions).values({
      symbol: "DEMCO", exDate: rows[230]!.tradeDate, series: "EQ", subject: "Demerger",
      kind: "demerger", factor: 1, company: "DemCo Ltd", recordDate: null,
    });
    const jumps: unknown[] = [];
    await computeIndicators("NIFTY50", { onUnexplainedJump: (j) => jumps.push(j) });
    expect(jumps).toEqual([]);

    const at = async (i: number) => (await db.select().from(schema.dailyIndicators).where(and(
      eq(schema.dailyIndicators.symbol, "DEMCO"),
      eq(schema.dailyIndicators.tradeDate, rows[i]!.tradeDate),
    )))[0]!;
    expect((await at(259)).sma200!).toBeCloseTo(60, 6);
    expect((await at(259)).ema200!).toBeCloseTo(60, 6);
    expect((await at(229)).sma200!).toBeCloseTo(100, 6);
  }, 30000);
});

describe("computeIndicators across a split", () => {
  // Flat at 500, then a 1:5 split on day 230: raw closes drop to 100 overnight
  // although nothing happened to the stock. This is the KOTAKBANK bug.
  function splitSeries() {
    return synthetic("SPLITCO", 260).map((r, i) => {
      const close = i < 230 ? 500 : 100;
      return { ...r, open: close, high: close, low: close, close, prevClose: close };
    });
  }

  beforeEach(async () => {
    await db.delete(schema.dailyIndicators);
    await db.delete(schema.dailyPrices);
    await db.delete(schema.indexMembers);
    await db.delete(schema.corporateActions);
  });

  async function load(withAction: boolean) {
    const rows = splitSeries();
    await db.insert(schema.dailyPrices).values(rows);
    await db.insert(schema.indexMembers).values({
      indexName: "NIFTY50", symbol: "SPLITCO", addedOn: "2020-01-01", removedOn: null,
    });
    if (withAction) {
      await db.insert(schema.corporateActions).values({
        symbol: "SPLITCO", exDate: rows[230]!.tradeDate, series: "EQ",
        subject: "Face Value Split (Sub-Division) - From Rs 5/- Per Share To Re 1/- Per Share",
        kind: "split", factor: 5, company: "SplitCo Ltd", recordDate: null,
      });
    }
    await computeIndicators();
    return rows;
  }

  async function on(date: string) {
    const [got] = await db.select().from(schema.dailyIndicators).where(and(
      eq(schema.dailyIndicators.symbol, "SPLITCO"),
      eq(schema.dailyIndicators.tradeDate, date),
    ));
    return got!;
  }

  test("averages after the split are in post-split rupees", async () => {
    const rows = await load(true);
    const last = await on(rows[259]!.tradeDate);
    expect(last.close).toBe(100);
    expect(last.sma50!).toBeCloseTo(100, 6);
    expect(last.sma200!).toBeCloseTo(100, 6);
    expect(last.ema200!).toBeCloseTo(100, 6);
  }, 30000);

  test("averages before the split stay in the rupees that day traded at", async () => {
    const rows = await load(true);
    const before = await on(rows[229]!.tradeDate);
    expect(before.close).toBe(500);
    expect(before.sma200!).toBeCloseTo(500, 6);
    expect(before.ema200!).toBeCloseTo(500, 6);
  }, 30000);

  test("without the action the raw drop poisons the average (the original bug)", async () => {
    const rows = await load(false);
    const last = await on(rows[259]!.tradeDate);
    expect(last.sma200!).toBeGreaterThan(150);
  }, 30000);

  test("reports a jump that no corporate action explains", async () => {
    const jumps: { symbol: string; date: string; from: number; to: number }[] = [];
    const rows = splitSeries();
    await db.insert(schema.dailyPrices).values(rows);
    await db.insert(schema.indexMembers).values({
      indexName: "NIFTY50", symbol: "SPLITCO", addedOn: "2020-01-01", removedOn: null,
    });
    await computeIndicators("NIFTY50", { onUnexplainedJump: (j) => jumps.push(j) });
    expect(jumps).toEqual([
      { symbol: "SPLITCO", date: rows[230]!.tradeDate, from: 500, to: 100 },
    ]);
  }, 30000);
});

describe("computeIndicators: the day's move (change_pct)", () => {
  // Feeds Advance/Decline. bhavcopy's prev_close is NOT adjusted on an ex-date
  // (decision 0002), so the move must come from the adjusted, stitched series.
  beforeEach(async () => {
    await db.delete(schema.dailyIndicators);
    await db.delete(schema.dailyPrices);
    await db.delete(schema.indexMembers);
    await db.delete(schema.corporateActions);
    await db.delete(schema.symbolChanges);
  });

  const member = (symbol: string) => db.insert(schema.indexMembers).values({
    indexName: "NIFTY50", symbol, addedOn: "2020-01-01", removedOn: null,
  });
  const moves = async (symbol: string) =>
    (await db.select().from(schema.dailyIndicators).where(eq(schema.dailyIndicators.symbol, symbol)))
      .sort((a, b) => (a.tradeDate < b.tradeDate ? -1 : 1))
      .map((r) => r.changePct);

  test("is the % change from the previous session, null on the first", async () => {
    await db.insert(schema.dailyPrices).values(synthetic("RAMP", 3)); // 100, 101, 102
    await member("RAMP");
    await computeIndicators();
    const m = await moves("RAMP");
    expect(m[0]).toBeNull();
    expect(m[1]!).toBeCloseTo(1, 9);
    expect(m[2]!).toBeCloseTo((102 / 101 - 1) * 100, 9);
  });

  test("a 1:5 split is not an 80% fall", async () => {
    const rows = synthetic("SPLITCO", 4).map((r, i) => ({ ...r, close: i < 2 ? 500 : 100, open: i < 2 ? 500 : 100 }));
    await db.insert(schema.dailyPrices).values(rows);
    await member("SPLITCO");
    await db.insert(schema.corporateActions).values({
      symbol: "SPLITCO", exDate: rows[2]!.tradeDate, series: "EQ", subject: "Split",
      kind: "split", factor: 5, company: null, recordDate: null,
    });
    await computeIndicators();
    expect((await moves("SPLITCO"))[2]!).toBeCloseTo(0, 9);
  });

  test("the first day under a new symbol compares with the old symbol's last close", async () => {
    const rows = synthetic("X", 4).map((r, i) => ({ ...r, symbol: i < 2 ? "OLDNAME" : "NEWNAME" }));
    await db.insert(schema.dailyPrices).values(rows);
    await member("NEWNAME");
    await db.insert(schema.symbolChanges).values({
      oldSymbol: "OLDNAME", newSymbol: "NEWNAME", changedOn: rows[2]!.tradeDate, company: null,
    });
    await computeIndicators();
    expect((await moves("NEWNAME"))[2]!).toBeCloseTo((102 / 101 - 1) * 100, 9);
  });

  test("no move is claimed across a hole in the data", async () => {
    const rows = synthetic("HOLE", 3);
    rows[2]!.tradeDate = "2020-03-01"; // weeks after the previous row
    await db.insert(schema.dailyPrices).values(rows);
    await member("HOLE");
    await computeIndicators();
    expect((await moves("HOLE"))[2]).toBeNull();
  });
});

describe("computeIndicators: volume vs its 20-session normal (vol_ratio)", () => {
  beforeEach(async () => {
    await db.delete(schema.dailyIndicators);
    await db.delete(schema.dailyPrices);
    await db.delete(schema.indexMembers);
    await db.delete(schema.corporateActions);
    await db.delete(schema.symbolChanges);
  });

  async function run(symbol: string, rows: ReturnType<typeof synthetic>, action?: { kind: string; factor: number; at: number }) {
    await db.insert(schema.dailyPrices).values(rows);
    await db.insert(schema.indexMembers).values({ indexName: "NIFTY50", symbol, addedOn: "2020-01-01", removedOn: null });
    if (action) {
      await db.insert(schema.corporateActions).values({
        symbol, exDate: rows[action.at]!.tradeDate, series: "EQ", subject: action.kind,
        kind: action.kind, factor: action.factor, company: null, recordDate: null,
      });
    }
    await computeIndicators();
    return (await db.select().from(schema.dailyIndicators).where(eq(schema.dailyIndicators.symbol, symbol)))
      .sort((a, b) => (a.tradeDate < b.tradeDate ? -1 : 1))
      .map((r) => r.volRatio);
  }

  test("a 1:5 split's fivefold share count is not a volume surge", async () => {
    const rows = synthetic("SPLITV", 25).map((r, i) => (i >= 22 ? { ...r, volume: 5000, close: r.close / 5, open: r.open / 5 } : r));
    const v = await run("SPLITV", rows, { kind: "split", factor: 5, at: 22 });
    expect(v[19]).toBeNull();
    expect(v[24]!).toBeCloseTo(1, 9);
  });

  test("a demerger does not scale volume: the share count didn't change", async () => {
    const rows = synthetic("DEMV", 25).map((r, i) => (i >= 22 ? { ...r, close: 60, open: 60 } : { ...r, close: 100, open: 100 }));
    const v = await run("DEMV", rows, { kind: "demerger", factor: 1, at: 22 });
    expect(v[24]!).toBeCloseTo(1, 9);
  });
});

describe("computeIndicators: turnover", () => {
  beforeEach(async () => {
    await db.delete(schema.dailyIndicators);
    await db.delete(schema.dailyPrices);
    await db.delete(schema.indexMembers);
    await db.delete(schema.corporateActions);
    await db.delete(schema.symbolChanges);
  });

  test("is stored per session and joined across a rename", async () => {
    const rows = synthetic("X", 4).map((r, i) => ({ ...r, symbol: i < 2 ? "OLDT" : "NEWT", turnover: 1e9 + i }));
    await db.insert(schema.dailyPrices).values(rows);
    await db.insert(schema.indexMembers).values({ indexName: "NIFTY50", symbol: "NEWT", addedOn: "2020-01-01", removedOn: null });
    await db.insert(schema.symbolChanges).values({ oldSymbol: "OLDT", newSymbol: "NEWT", changedOn: rows[2]!.tradeDate, company: null });
    await computeIndicators();
    const got = (await db.select().from(schema.dailyIndicators).where(eq(schema.dailyIndicators.symbol, "NEWT")))
      .sort((a, b) => (a.tradeDate < b.tradeDate ? -1 : 1))
      .map((r) => r.turnover);
    expect(got).toEqual([1e9, 1e9 + 1, 1e9 + 2, 1e9 + 3]);
  });
});

// Decision 0034: one pass over every registered index's members, shared stocks once.
describe("computeIndicators over every registered index", () => {
  beforeEach(async () => {
    await db.delete(schema.dailyIndicators);
    await db.delete(schema.dailyPrices);
    await db.delete(schema.indexMembers);
  });

  test("a stock in both the NIFTY 50 and Nifty Bank is computed once; a Bank-only stock is computed too", async () => {
    await db.insert(schema.dailyPrices).values([...synthetic("SHARED", 260), ...synthetic("BANKONLY", 260)]);
    await db.insert(schema.indexMembers).values([
      { indexName: "NIFTY50", symbol: "SHARED", addedOn: "2020-01-01", removedOn: null },
      { indexName: "NIFTYBANK", symbol: "SHARED", addedOn: "2020-01-01", removedOn: null },
      { indexName: "NIFTYBANK", symbol: "BANKONLY", addedOn: "2020-01-01", removedOn: "2020-06-01" },
    ]);
    const written = await computeIndicators();
    expect(written).toBe(520);
    const out = await db.select().from(schema.dailyIndicators);
    expect(out.filter((r) => r.symbol === "SHARED")).toHaveLength(260);
    expect(out.filter((r) => r.symbol === "BANKONLY")).toHaveLength(260);
  }, 30000);

  test("a stock's numbers are the same whichever index lists it", async () => {
    await db.insert(schema.dailyPrices).values(synthetic("SHARED", 260));
    await db.insert(schema.indexMembers).values({ indexName: "NIFTY50", symbol: "SHARED", addedOn: "2020-01-01", removedOn: null });
    await computeIndicators("NIFTY50");
    const alone = await db.select().from(schema.dailyIndicators);
    await db.insert(schema.indexMembers).values({ indexName: "NIFTYBANK", symbol: "SHARED", addedOn: "2020-01-01", removedOn: null });
    await computeIndicators();
    const both = await db.select().from(schema.dailyIndicators);
    const key = (r: { tradeDate: string }) => r.tradeDate;
    expect([...both].sort((a, b) => key(a).localeCompare(key(b)))).toEqual([...alone].sort((a, b) => key(a).localeCompare(key(b))));
  }, 30000);
});
