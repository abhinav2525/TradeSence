import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { ema } from "../src/indicators/moving-average";
import { deriveAdvanceDecline, advanceDeclineSeries } from "../src/query/advance-decline";

const day = (i: number) => {
  const d = new Date(Date.UTC(2020, 0, 1));
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
};
const counts = (advancing: number, declining: number, unchanged = 0, i = 0) =>
  ({ date: day(i), advancing, declining, unchanged });

describe("deriveAdvanceDecline", () => {
  test("net and the ratio-adjusted net (RANA, per 1,000)", () => {
    const [p] = deriveAdvanceDecline([counts(30, 20)]);
    expect(p!.net).toBe(10);
    expect(p!.rana).toBeCloseTo(200, 9); // (30-20)/(30+20)*1000
  });

  test("a day when nothing moved has RANA 0, not a division by zero", () => {
    const [p] = deriveAdvanceDecline([counts(0, 0, 50)]);
    expect(p!.rana).toBe(0);
    expect(p!.advShare).toBe(50);
  });

  test("McClellan is EMA19 minus EMA39 of RANA, empty until 39 sessions", () => {
    const rows = Array.from({ length: 60 }, (_, i) => counts(20 + (i % 7), 25 - (i % 5), 0, i));
    const out = deriveAdvanceDecline(rows);
    const rana = out.map((p) => p.rana);
    const e19 = ema(rana, 19), e39 = ema(rana, 39);
    expect(out[37]!.mcclellan).toBeNull();
    expect(out[38]!.mcclellan!).toBeCloseTo(e19[38]! - e39[38]!, 9);
    expect(out[59]!.mcclellan!).toBeCloseTo(e19[59]! - e39[59]!, 9);
  });

  test("the summation index is the running sum of McClellan", () => {
    const rows = Array.from({ length: 45 }, (_, i) => counts(10 + i, 40 - (i % 3), 0, i));
    const out = deriveAdvanceDecline(rows);
    expect(out[37]!.summation).toBeNull();
    expect(out[38]!.summation!).toBeCloseTo(out[38]!.mcclellan!, 9);
    expect(out[44]!.summation!).toBeCloseTo(
      out.slice(38, 45).reduce((s, p) => s + p.mcclellan!, 0), 9);
  });

  test("the A/D line is the running sum of net", () => {
    const out = deriveAdvanceDecline([counts(30, 20, 0, 0), counts(10, 40, 0, 1), counts(25, 25, 0, 2)]);
    expect(out.map((p) => p.adLine)).toEqual([10, -20, -20]);
  });

  test("the 10-day advancing share is EMA10 of A ÷ (A + D), in percent", () => {
    const rows = Array.from({ length: 12 }, (_, i) => counts(i % 2 ? 40 : 10, i % 2 ? 10 : 40, 0, i));
    const out = deriveAdvanceDecline(rows);
    const share = rows.map((r) => (r.advancing / (r.advancing + r.declining)) * 100);
    expect(out[8]!.adv10).toBeNull();
    expect(out[11]!.adv10!).toBeCloseTo(ema(share, 10)[11]!, 9);
  });

  test("averages restart after a hole in the data instead of spanning it", () => {
    const rows = Array.from({ length: 50 }, (_, i) => counts(30, 20, 0, i < 25 ? i : i + 40));
    const out = deriveAdvanceDecline(rows);
    // The hole is before index 25, so EMA10 needs indices 25..34 again.
    expect(out[33]!.adv10).toBeNull();
    expect(out[34]!.adv10).not.toBeNull();
    expect(out[25]!.adLine).toBe(10); // running sums restart too
  });
});

describe("advanceDeclineSeries", () => {
  beforeEach(async () => {
    await db.delete(schema.dailyIndicators);
    await db.delete(schema.indexMembers);
  });

  const ind = (tradeDate: string, symbol: string, changePct: number | null) =>
    ({ tradeDate, symbol, close: 1, sma50: null, sma200: null, ema200: null, changePct });

  test("counts members on each date only, and leaves out stocks with no move", async () => {
    await db.insert(schema.indexMembers).values([
      { indexName: "NIFTY50", symbol: "A", addedOn: "2020-01-01", removedOn: null },
      { indexName: "NIFTY50", symbol: "B", addedOn: "2020-01-01", removedOn: "2020-01-03" },
    ]);
    await db.insert(schema.dailyIndicators).values([
      ind("2020-01-02", "A", 1.5), ind("2020-01-02", "B", -2), ind("2020-01-02", "NOTMEMBER", 3),
      ind("2020-01-03", "A", 0), ind("2020-01-03", "B", 5),       // B left the index
      ind("2020-01-06", "A", null),                                 // no move: excluded
    ]);
    expect(await advanceDeclineSeries()).toMatchObject([
      { date: "2020-01-02", advancing: 1, declining: 1, unchanged: 0 },
      { date: "2020-01-03", advancing: 0, declining: 0, unchanged: 1 },
    ]);
  });
});
