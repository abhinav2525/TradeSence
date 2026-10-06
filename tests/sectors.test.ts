import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SECTORS, sectorOf, shortSector } from "../src/lib/sectors";
import { fetchNifty50Industries } from "../src/ingest/nifty50";

const historySymbols = [
  ...new Set(
    readFileSync(join(import.meta.dir, "../src/ingest/nifty50-history.csv"), "utf8")
      .split(/\r?\n/)
      .filter((l) => l.trim() !== "" && !l.startsWith("#"))
      .slice(1)
      .map((l) => l.split(",")[0]!.trim()),
  ),
];

describe("sectors", () => {
  test("every stock ever in nifty50-history.csv has a sector", () => {
    expect(historySymbols.length).toBeGreaterThan(50);
    expect(historySymbols.filter((s) => sectorOf(s) === null)).toEqual([]);
  });

  test("no stale entries: every tagged symbol is in the membership file", () => {
    expect(Object.keys(SECTORS).filter((s) => !historySymbols.includes(s))).toEqual([]);
  });

  test("unknown symbols and object keys get null", () => {
    expect(sectorOf("NOTASTOCK")).toBeNull();
    expect(sectorOf("toString")).toBeNull();
  });

  test("short names for long sectors, the rest unchanged", () => {
    expect(shortSector("Fast Moving Consumer Goods")).toBe("FMCG");
    expect(shortSector("Healthcare")).toBe("Healthcare");
  });

  // Live: if this fails, NSE reclassified a member or added one; update SECTORS.
  test("today's members carry NSE's own sector", async () => {
    const live = await fetchNifty50Industries();
    expect(live.size).toBe(50);
    const wrong = [...live].filter(([s, i]) => sectorOf(s) !== i).map(([s, i]) => `${s}: ${sectorOf(s)} vs NSE ${i}`);
    expect(wrong).toEqual([]);
  }, 30000);
});
