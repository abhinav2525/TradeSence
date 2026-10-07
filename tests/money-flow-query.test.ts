import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { sectorHistory, shareHistory, shareYear } from "../src/query/money-flow";

const week = (sector: string, weekEnd: string, turnover: number, totalTurnover: number, ratio: number | null = 1) =>
  ({ sector, weekEnd, turnover, totalTurnover, ratio, medianMove: 0, stocks: 5, shortSession: false, newListingTurnover: 0 });
const block = { nowFrom: "2026-07-08", nowTo: "2026-10-06", agoFrom: "2025-07-08", agoTo: "2025-10-06" };

beforeEach(async () => {
  for (const t of [schema.sectorFlowWeeks, schema.sectorShareYear]) await db.delete(t);
});

describe("shareYear (sector_share_year)", () => {
  test("rows and the two blocks' dates; empty table → null (needs a year of history)", async () => {
    expect(await shareYear()).toBeNull();
    await db.insert(schema.sectorShareYear).values([
      { sector: "IT", stocks: 40, nowTurnover: 7, nowTotal: 100, agoTurnover: 8, agoTotal: 200, newListingTurnover: 1, ...block },
      { sector: "Auto", stocks: 49, nowTurnover: 9, nowTotal: 100, agoTurnover: 20, agoTotal: 200, newListingTurnover: 0, ...block },
    ]);
    const y = (await shareYear())!;
    expect(y.blocks).toEqual(block);
    expect(y.rows.map((r) => r.sector)).toEqual(["Auto", "IT"]);
    expect(y.rows[1]).toEqual({ sector: "IT", stocks: 40, nowTurnover: 7, nowTotal: 100, agoTurnover: 8, agoTotal: 200, newListingTurnover: 1 });
  });
});

describe("shareHistory and sectorHistory's share", () => {
  test("every sector's weekly share in %, oldest first; a week with no total has no share", async () => {
    await db.insert(schema.sectorFlowWeeks).values([
      week("IT", "2026-10-02", 10, 100), week("IT", "2026-09-25", 30, 200), week("Auto", "2026-10-02", 5, 100), week("Auto", "2026-09-25", 0, 0, null),
    ]);
    const h = await shareHistory();
    expect([...h.keys()].sort()).toEqual(["Auto", "IT"]);
    expect(h.get("IT")!.map((p) => p.weekEnd)).toEqual(["2026-09-25", "2026-10-02"]);
    expect(h.get("IT")![0]!.sharePct).toBeCloseTo(15, 12);
    expect(h.get("Auto")![0]!.sharePct).toBeNull();
    const s = await sectorHistory("IT");
    expect(s.map((p) => p.sharePct)).toEqual([15, 10]);
  });
});
