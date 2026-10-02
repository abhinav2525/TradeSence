import { test, expect, describe } from "bun:test";
import { fetchNifty50Symbols } from "../src/ingest/nifty50";

describe("fetchNifty50Symbols", () => {
  test("returns exactly 50 symbols from NSE's published list", async () => {
    const symbols = await fetchNifty50Symbols();
    expect(symbols).toHaveLength(50);
    expect(symbols).toContain("RELIANCE");
    expect(symbols).toContain("TCS");
    expect(new Set(symbols).size).toBe(50); // no duplicates
  }, 30000);
});
