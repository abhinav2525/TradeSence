import { test, expect } from "bun:test";
import { reportCardHref } from "../src/lib/report-card-link";

// Report Cards exist for NIFTY 50 members past and present (Nifty Bank's come in
// step B, decision 0034): a Bank-only stock must not link to a page that 404s.
test("links every symbol when no card list is given (the NIFTY 50 pages)", () => {
  expect(reportCardHref("M&M")).toBe("/stock/M%26M");
});

test("links only symbols with a card when a list is given", () => {
  const cards = new Set(["HDFCBANK"]);
  expect(reportCardHref("HDFCBANK", cards)).toBe("/stock/HDFCBANK");
  expect(reportCardHref("FEDERALBNK", cards)).toBeNull();
});
