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
    for (const t of [schema.dailyPrices, schema.ingestLog, schema.moneyFlow, schema.sectorFlowWeeks, schema.shortSessions, schema.indexConstituents, schema.symbolChanges]) await db.delete(t);
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
    expect(await computeMoneyFlow()).toEqual({ rows: 0, weeks: 0, shortSessions: 0, asOf: null });
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
});
