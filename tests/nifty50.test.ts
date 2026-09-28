import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { fetchNifty50Symbols, seedNifty50 } from "../src/ingest/nifty50";

describe("fetchNifty50Symbols", () => {
  test("returns exactly 50 symbols from NSE's published list", async () => {
    const symbols = await fetchNifty50Symbols();
    expect(symbols).toHaveLength(50);
    expect(symbols).toContain("RELIANCE");
    expect(symbols).toContain("TCS");
    expect(new Set(symbols).size).toBe(50); // no duplicates
  }, 30000);
});

describe("seedNifty50", () => {
  beforeEach(async () => {
    await db.delete(schema.indexMembers);
  });

  test("writes one open membership row per constituent", async () => {
    const n = await seedNifty50("2016-09-28");
    expect(n).toBe(50);

    const rows = await db.select().from(schema.indexMembers);
    expect(rows).toHaveLength(50);
    expect(rows.every((r) => r.indexName === "NIFTY50")).toBe(true);
    expect(rows.every((r) => r.removedOn === null)).toBe(true);
    expect(rows.every((r) => r.addedOn === "2016-09-28")).toBe(true);
  }, 30000);

  test("is idempotent: re-seeding does not duplicate members", async () => {
    await seedNifty50("2016-09-28");
    await seedNifty50("2016-09-28");
    const rows = await db.select().from(schema.indexMembers);
    expect(rows).toHaveLength(50);
  }, 45000);
});
