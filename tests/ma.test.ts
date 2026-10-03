import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { MA_LABELS } from "../src/lib/ma";
import { MA_COLUMNS, MA_LABELS as BREADTH_LABELS } from "../src/query/breadth";

test("the average labels live in a pure module, with no imports, so browser code can use them", () => {
  expect(MA_LABELS).toEqual({ sma200: "200-day SMA", ema200: "200-day EMA", sma50: "50-day SMA" });
  expect(readFileSync("src/lib/ma.ts", "utf8")).not.toMatch(/^\s*import\s/m);
});

test("breadth.ts re-exports the same labels, and every average has a column", () => {
  expect(BREADTH_LABELS).toBe(MA_LABELS);
  expect(Object.keys(MA_COLUMNS).sort()).toEqual(Object.keys(MA_LABELS).sort());
});

test("MaTabs no longer imports the database-backed query module", () => {
  expect(readFileSync("src/components/MaTabs.tsx", "utf8")).not.toContain("@/query/");
});
