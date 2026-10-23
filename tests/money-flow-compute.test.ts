import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { computeMoneyFlow } from "../src/indicators/compute-money-flow";

function weekdays(n: number): string[] {
  const out: string[] = [];
  const d = new Date("2026-01-01T00:00:00Z");
  while (out.length < n) {
    if (d.getUTCDay() % 6 !== 0) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
const price = (tradeDate: string, symbol: string, turnover: number) =>
  ({ tradeDate, symbol, series: "EQ", open: 1, high: 1, low: 1, close: 1, prevClose: 1, volume: 10, turnover });

describe("computeMoneyFlow", () => {
  beforeEach(async () => {
    for (const t of [schema.corporateActions, schema.dailyPrices, schema.ingestLog, schema.moneyFlow, schema.sectorFlowWeeks, schema.shortSessions, schema.sectorShareYear, schema.indexConstituents, schema.symbolChanges]) await db.delete(t);
  });

  test("three periods per stock, a renamed stock's normal includes its old symbol, re-run replaces", async () => {
    const days = weekdays(90);
    await db.insert(schema.ingestLog).values(days.map((d) => ({ tradeDate: d, source: "bhavcopy", status: "ok", format: "udiff", rowCount: 2 })));
    // NEWCO traded as OLDCO for its first 60 sessions
    await db.insert(schema.symbolChanges).values({ oldSymbol: "OLDCO", newSymbol: "NEWCO", changedOn: days[60]! });
    await db.insert(schema.dailyPrices).values([
      ...days.map((d, i) => price(d, i < 60 ? "OLDCO" : "NEWCO", 2e7)),
      ...days.map((d) => price(d, "ABC", 1e7)),
    ]);
    await db.insert(schema.indexConstituents).values([
      { indexKey: "total-market", symbol: "NEWCO", industry: "Metals & Mining", fetchedOn: days.at(-1)! },
      { indexKey: "total-market", symbol: "ABC", industry: "Capital Goods", fetchedOn: days.at(-1)! },
    ]);
    await computeMoneyFlow();
    const r = await computeMoneyFlow();
    expect(r).toMatchObject({ rows: 6, asOf: days.at(-1) });
    const rows = await db.select().from(schema.moneyFlow);
    expect(rows).toHaveLength(6);
    const newco = rows.find((x) => x.symbol === "NEWCO" && x.period === 21)!;
    // its 63-session normal window reaches back into the OLDCO days: a normal exists
    expect(newco).toMatchObject({ sector: "Metals & Mining", turnover: 21 * 2e7, normalDaily: 2e7, sessions: 21 });
  });

  test("too little history for a normal window: nothing written", async () => {
    const days = weekdays(30);
    await db.insert(schema.ingestLog).values(days.map((d) => ({ tradeDate: d, source: "bhavcopy", status: "ok", format: "udiff", rowCount: 1 })));
    expect(await computeMoneyFlow()).toEqual({ rows: 0, weeks: 0, shortSessions: 0, shareRows: 0, asOf: null });
  });

  test("history: 52 weeks for a 5-stock sector, a low market day flagged, re-run replaces", async () => {
    const days = weekdays(400);
    const low = days[390]!; // a short special session near the end
    const syms = ["S1", "S2", "S3", "S4", "S5"];
    await db.insert(schema.ingestLog).values(days.map((d) => ({ tradeDate: d, source: "bhavcopy", status: "ok", format: "udiff", rowCount: 5 })));
    for (const s of syms) {
      await db.insert(schema.dailyPrices).values(days.map((d) => price(d, s, d === low ? 1e6 : 1e7)));
    }
    await db.insert(schema.indexConstituents).values(syms.map((symbol) => ({ indexKey: "total-market", symbol, industry: "Information Technology", fetchedOn: days.at(-1)! })));
    await computeMoneyFlow();
    await computeMoneyFlow();
    const weeks = await db.select().from(schema.sectorFlowWeeks);
    expect(weeks).toHaveLength(52);
    expect(weeks.every((w) => w.sector === "Information Technology")).toBe(true);
    const shortRows = await db.select().from(schema.shortSessions);
    expect(shortRows.map((r) => r.tradeDate)).toEqual([low]);
    expect(weeks.filter((w) => w.shortSession)).toHaveLength(1);
  });

  test("share over a year: year-ago block on the same calendar dates, through the rename lineage; re-run replaces", async () => {
    const days = weekdays(400); // 2026-01-01 … mid-2027
    await db.insert(schema.ingestLog).values(days.map((d) => ({ tradeDate: d, source: "bhavcopy", status: "ok", format: "udiff", rowCount: 7 })));
    // R1 traded as OLDR1 until 2027-01-01: its whole year-ago block is under the old symbol
    await db.insert(schema.symbolChanges).values({ oldSymbol: "OLDR1", newSymbol: "R1", changedOn: "2027-01-01" });
    const it = ["R1", "S2", "S3", "S4", "S5"];
    for (const s of it) await db.insert(schema.dailyPrices).values(days.map((d) => price(d, s === "R1" && d < "2027-01-01" ? "OLDR1" : s, 1e7)));
    // a small sector (2 stocks) that trades 3e7 a day
    for (const s of ["T1", "T2"]) await db.insert(schema.dailyPrices).values(days.map((d) => price(d, s, 3e7)));
    // NEWL, an IT stock that lists at the start of the latest 3 months: a new listing
    await db.insert(schema.dailyPrices).values(days.slice(-63).map((d) => price(d, "NEWL", 1e7)));
    await db.insert(schema.corporateActions).values({ symbol: "R1", exDate: "2026-12-01", subject: "Demerger", series: "EQ", kind: "demerger", factor: 1 });
    await db.insert(schema.indexConstituents).values([
      ...[...it, "NEWL"].map((symbol) => ({ indexKey: "total-market", symbol, industry: "Information Technology", fetchedOn: days.at(-1)! })),
      ...["T1", "T2"].map((symbol) => ({ indexKey: "total-market", symbol, industry: "Textiles", fetchedOn: days.at(-1)! })),
    ]);
    await computeMoneyFlow();
    const r = await computeMoneyFlow();
    expect(r.shareRows).toBe(1);
    const [row] = await db.select().from(schema.sectorShareYear);
    const nowFrom = days.at(-63)!;
    expect(row).toMatchObject({ sector: "Information Technology", stocks: 6, nowFrom, nowTo: days.at(-1), agoFrom: `2026${nowFrom.slice(4)}`, agoTo: `2026${days.at(-1)!.slice(4)}` });
    const agoSessions = days.filter((d) => d >= row!.agoFrom && d <= row!.agoTo).length;
    expect(row!.agoTurnover).toBeCloseTo(5 * agoSessions * 1e7, 0); // OLDR1's rupees are in R1's year-ago block
    expect(row!.agoTotal).toBeCloseTo(11 * agoSessions * 1e7, 0); // Textiles count in the total
    expect(row!.nowTurnover).toBeCloseTo(6 * 63 * 1e7, 0);
    expect(row!.nowTotal).toBeCloseTo(12 * 63 * 1e7, 0);
    expect(row!.newListingTurnover).toBeCloseTo(63 * 1e7, 0); // NEWL's rupees, a sixth of the sector's
    expect(row!.demerged).toEqual([{ symbol: "R1", exDate: "2026-12-01" }]); // filed under today's symbol, while it traded as OLDR1
    const weeks = await db.select().from(schema.sectorFlowWeeks);
    expect(weeks).toHaveLength(52);
    const w0 = weeks.find((w) => w.weekEnd === days.at(-1))!;
    expect(w0.turnover).toBeCloseTo(6 * 5 * 1e7, 0);
    expect(w0.totalTurnover).toBeCloseTo(12 * 5 * 1e7, 0);
    expect(w0.newListingTurnover).toBeCloseTo(5 * 1e7, 0);
    // a week before NEWL listed has no new-listing rupees
    expect(weeks.find((w) => w.weekEnd < days.at(-63)!)!.newListingTurnover).toBe(0);
  });

  test("share over a year: without a year of history the table is empty and no week has a new-listing figure", async () => {
    const days = weekdays(200);
    await db.insert(schema.ingestLog).values(days.map((d) => ({ tradeDate: d, source: "bhavcopy", status: "ok", format: "udiff", rowCount: 5 })));
    const syms = ["S1", "S2", "S3", "S4", "S5"];
    for (const s of syms) await db.insert(schema.dailyPrices).values(days.map((d) => price(d, s, 1e7)));
    await db.insert(schema.indexConstituents).values(syms.map((symbol) => ({ indexKey: "total-market", symbol, industry: "Information Technology", fetchedOn: days.at(-1)! })));
    const r = await computeMoneyFlow();
    expect(r.shareRows).toBe(0);
    expect(await db.select().from(schema.sectorShareYear)).toHaveLength(0);
    const weeks = await db.select().from(schema.sectorFlowWeeks);
    expect(weeks.length).toBeGreaterThan(0);
    expect(weeks.every((w) => w.newListingTurnover === null && w.totalTurnover > 0)).toBe(true);
  });
});
