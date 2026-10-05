import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { eq } from "drizzle-orm";
import { INDICES, NIFTY50, NIFTY_BANK, indexByKey, cleanIndex, sizeOn, uParam, membersPhrase, parseMembersArgs } from "../src/ingest/indices";
import { INDEX_LISTS } from "../src/ingest/index-constituents";
import { fetchIndexDay } from "../src/ingest/index-prices";
import { loadMembership, readMembershipHistory, validateMembershipHistory } from "../src/ingest/nifty50-history";
import { readFileSync } from "node:fs";

const HEADER = "symbol,added_on,removed_on,listed_as,source\n";

describe("the index registry", () => {
  test("keys, membership names and files are each used once", () => {
    for (const field of ["key", "members", "prices", "list", "label"] as const) {
      const values = INDICES.map((x) => x[field]);
      expect(new Set(values).size).toBe(values.length);
    }
    const files = INDICES.map((x) => x.file.href);
    expect(new Set(files).size).toBe(files.length);
  });

  test("the NIFTY 50 is the first entry and keeps its stored name", () => {
    expect(INDICES[0]).toBe(NIFTY50);
    expect(NIFTY50).toMatchObject({ key: "nifty50", members: "NIFTY50", prices: "Nifty 50" });
  });

  test("every list key is one of NSE's index lists", () => {
    const keys = new Set<string>(INDEX_LISTS.map((x) => x.key));
    for (const ix of INDICES) expect(keys.has(ix.list)).toBe(true);
  });

  test("a size schedule starts on 2020-01-01 and is in date order", () => {
    for (const ix of INDICES) {
      expect(ix.sizes[0]!.from).toBe("2020-01-01");
      const froms = ix.sizes.map((s) => s.from);
      expect([...froms].sort()).toEqual(froms);
    }
  });

  test("sizeOn follows the dated schedule", () => {
    const bank = indexByKey("bank")!;
    expect(sizeOn(bank.sizes, "2020-01-01")).toBe(12);
    expect(sizeOn(bank.sizes, "2025-12-30")).toBe(12);
    expect(sizeOn(bank.sizes, "2025-12-31")).toBe(14);
    expect(sizeOn(NIFTY50.sizes, "2026-10-05")).toBe(50);
  });

  // Live: NSE's daily index-close file names each index exactly as index_prices stores it.
  test("every price name is an index in NSE's daily close file", async () => {
    let names: string[] = [];
    for (const day of ["2026-10-01", "2026-09-30", "2026-09-29"]) {
      const r = await fetchIndexDay(day);
      if (r.status === "ok") { names = r.rows.map((x) => x.indexName); break; }
    }
    expect(names.length).toBeGreaterThan(0);
    for (const ix of INDICES) expect(names).toContain(ix.prices);
  }, 60000);
});

describe("cleanIndex (the pages' u parameter)", () => {
  test("a registered key is kept", () => {
    expect(cleanIndex("bank").key).toBe("bank");
    expect(cleanIndex("nifty50").key).toBe("nifty50");
  });

  test("anything else is the NIFTY 50", () => {
    for (const v of [undefined, "", "BANK", "bank ", "private-bank", "market", "NIFTYBANK", "bank'--", "__proto__", "constructor"]) {
      expect(cleanIndex(v)).toBe(NIFTY50);
    }
  });
});

describe("parseMembersArgs (bun run ingest:members <key> [--force])", () => {
  test("a registered key, with or without --force", () => {
    expect(parseMembersArgs(["bank"])).toEqual({ entry: NIFTY_BANK, force: false });
    expect(parseMembersArgs(["bank", "--force"])).toEqual({ entry: NIFTY_BANK, force: true });
  });
  test("anything else is refused (null), so nothing loads", () => {
    for (const argv of [["NIFTYBANK"], ["Bank"], [], ["bank", "--forse"]]) expect(parseMembersArgs(argv)).toBeNull();
  });
});

describe("uParam (links that keep the chosen index)", () => {
  test("the NIFTY 50 adds nothing, so every existing link stays the same", () => {
    expect(uParam(NIFTY50)).toBe("");
  });
  test("another index adds its key", () => {
    expect(uParam(indexByKey("bank")!)).toBe("&u=bank");
  });
  test("membersPhrase names the index's size on that date", () => {
    expect(membersPhrase(indexByKey("bank")!, "2025-12-30")).toBe("Nifty Bank's 12 members");
    expect(membersPhrase(indexByKey("bank")!, "2026-10-05")).toBe("Nifty Bank's 14 members");
  });
});

const r = (symbol: string, addedOn: string, removedOn: string | null = null) =>
  ({ symbol, addedOn, removedOn, listedAs: null, source: "" });
const twelve = () => Array.from({ length: 12 }, (_, i) => r(`B${i}`, "2020-01-01"));
const SCHEDULE = [{ from: "2020-01-01", n: 12 }, { from: "2025-12-31", n: 14 }];

describe("validateMembershipHistory with a dated size schedule", () => {
  test("12 members, then 14 from the change day, is valid", () => {
    const rows = [...twelve(), r("N1", "2025-12-31"), r("N2", "2025-12-31")];
    expect(validateMembershipHistory(rows, SCHEDULE)).toEqual([]);
  });

  test("still 12 after the change day is refused", () => {
    expect(validateMembershipHistory(twelve(), SCHEDULE)).toEqual(["2025-12-31: 12 members, expected 14"]);
  });

  test("14 a day early is refused", () => {
    const rows = [...twelve(), r("N1", "2025-12-30"), r("N2", "2025-12-30")];
    expect(validateMembershipHistory(rows, SCHEDULE)).toContain("2025-12-30: 14 members, expected 12");
  });

  test("a gap before the change is refused", () => {
    const rows = [...twelve(), r("N1", "2025-12-31"), r("N2", "2025-12-31")];
    rows[0] = r("B0", "2020-01-01", "2022-03-31"); // removed, nobody added
    expect(validateMembershipHistory(rows, SCHEDULE)).toContain("2022-03-31: 11 members, expected 12");
  });

  test("a gap after the change is refused", () => {
    const rows = [...twelve(), r("N1", "2025-12-31", "2026-03-31"), r("N2", "2025-12-31")];
    expect(validateMembershipHistory(rows, SCHEDULE)).toContain("2026-03-31: 13 members, expected 14");
  });

  test("an overlap is refused", () => {
    const rows = [...twelve(), r("N1", "2025-12-31"), r("N2", "2025-12-31"), r("B3", "2021-01-01", "2021-06-01")];
    expect(validateMembershipHistory(rows, SCHEDULE)).toContain("B3: overlapping periods");
  });

  test("a history that starts after the schedule does is refused", () => {
    const rows = Array.from({ length: 12 }, (_, i) => r(`B${i}`, "2020-02-01"));
    expect(validateMembershipHistory(rows, [{ from: "2020-01-01", n: 12 }])).toContain("2020-01-01: 0 members, expected 12");
  });
});

describe("loadMembership", () => {
  const bank = indexByKey("bank")!;
  const stored = async (name: string) =>
    db.select().from(schema.indexMembers).where(eq(schema.indexMembers.indexName, name));

  beforeEach(async () => {
    await db.delete(schema.dailyIndicators);
    await db.delete(schema.indexMembers);
  });

  test("loading Nifty Bank leaves the NIFTY 50's rows untouched", async () => {
    await loadMembership(NIFTY50);
    const before = await stored("NIFTY50");
    const n = await loadMembership(bank);
    expect(n).toBe(readMembershipHistory(bank).length);
    expect(await stored("NIFTY50")).toEqual(before);
    expect((await stored("NIFTYBANK")).length).toBe(n);
  });

  test("a reload that would store fewer rows is refused without force, and keeps what was there", async () => {
    await loadMembership(bank);
    const before = await stored("NIFTYBANK");
    const shorter = HEADER + twelve().map((x) => `${x.symbol},2020-01-01,,,s`).join("\n") + "\n" +
      "N1,2025-12-31,,,s\nN2,2025-12-31,,,s\n";
    await expect(loadMembership(bank, { text: shorter })).rejects.toThrow(/fewer|force/);
    expect(await stored("NIFTYBANK")).toEqual(before);
    expect(await loadMembership(bank, { text: shorter, force: true })).toBe(14);
    expect((await stored("NIFTYBANK")).length).toBe(14);
  });

  test("a file that breaks the schedule is refused, and keeps what was there", async () => {
    await loadMembership(bank);
    const before = await stored("NIFTYBANK");
    await expect(loadMembership(bank, { text: HEADER + "ONLYONE,2020-01-01,,,s\n", force: true })).rejects.toThrow(/members/);
    expect(await stored("NIFTYBANK")).toEqual(before);
  });

  test("the NIFTY 50's file loaded under the Nifty Bank entry is refused, and keeps what was there", async () => {
    await loadMembership(bank);
    const before = await stored("NIFTYBANK");
    const nifty50File = readFileSync(NIFTY50.file, "utf8");
    await expect(loadMembership(bank, { text: nifty50File, force: true })).rejects.toThrow(/expected 12/);
    expect(await stored("NIFTYBANK")).toEqual(before);
  });
});
