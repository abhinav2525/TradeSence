import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import {
  INDEX_LISTS, SIZE_KEYS, UNIVERSE_KEY, fetchConstituents, ingestIndexLists, parseConstituents, sizeProblems,
} from "../src/ingest/index-constituents";

// Rows copied from NSE's ind_niftytotalmarket_list.csv (4 Oct 2026).
const FILE = [
  "Company Name,Industry,Symbol,Series,ISIN Code",
  "360 ONE WAM Ltd.,Financial Services,360ONE,EQ,INE466L01038",
  "ABB India Ltd.,Capital Goods,ABB,EQ,INE117A01022",
].join("\r\n");
const bytes = (s: string) => new TextEncoder().encode(s);

describe("parseConstituents", () => {
  test("reads symbol and NSE industry", () => {
    expect(parseConstituents(FILE)).toEqual([
      { symbol: "360ONE", industry: "Financial Services" },
      { symbol: "ABB", industry: "Capital Goods" },
    ]);
  });
  test("refuses a header that lost a column it reads", () => {
    expect(() => parseConstituents(FILE.replace("Industry", "Sector"))).toThrow(/header/);
  });
  test("company names with commas in quotes don't shift the columns", () => {
    const f = FILE + '\r\n"Tata Motors, Ltd.",Automobile and Auto Components,TATAMOTORS,EQ,INE155A01022';
    expect(parseConstituents(f).at(-1)).toEqual({ symbol: "TATAMOTORS", industry: "Automobile and Auto Components" });
  });
});

describe("fetchConstituents", () => {
  test("an HTML page or empty list is an error, never an empty index", async () => {
    expect((await fetchConstituents("x.csv", { download: async () => ({ kind: "ok", bytes: bytes("<html>Access Denied</html>") }) })).status).toBe("error");
    expect((await fetchConstituents("x.csv", { download: async () => ({ kind: "ok", bytes: bytes("Company Name,Industry,Symbol,Series,ISIN Code") }) })).status).toBe("error");
  });
  test("downloads a real list from NSE", async () => {
    const r = await fetchConstituents("ind_niftybanklist.csv");
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.rows.some((x) => x.symbol === "HDFCBANK")).toBe(true);
  }, 30000);
});

describe("sizeProblems", () => {
  test("every universe stock in exactly one size list", () => {
    expect(sizeProblems(["A", "B", "C"], { large: ["A"], mid: ["B"], small: ["C"], micro: [] })).toEqual([]);
    expect(sizeProblems(["A", "B"], { large: ["A"], mid: ["A"], small: [], micro: [] })).toEqual(["A is in 2 size lists", "B is in no size list"]);
  });
});

describe("ingestIndexLists", () => {
  beforeEach(async () => { await db.delete(schema.indexConstituents); });
  test("stores every list; a failed one keeps yesterday's members", async () => {
    await db.insert(schema.indexConstituents).values({ indexKey: "bank", symbol: "OLDBANK", industry: "Financial Services", fetchedOn: "2026-10-01" });
    const download = async (url: string) =>
      url.endsWith("ind_niftybanklist.csv") ? ({ kind: "failed" as const, message: "timeout" }) : ({ kind: "ok" as const, bytes: bytes(FILE) });
    const r = await ingestIndexLists({ download, delayMs: 0 });
    expect(r.failed).toEqual(["Nifty Bank"]);
    expect(r.ok).toBe(INDEX_LISTS.length - 1);
    const bank = await db.select().from(schema.indexConstituents).where((await import("drizzle-orm")).eq(schema.indexConstituents.indexKey, "bank"));
    expect(bank.map((b) => b.symbol)).toEqual(["OLDBANK"]);
    expect(UNIVERSE_KEY).toBe("total-market");
    expect(SIZE_KEYS.large).toBe("nifty-100");
  });
});
