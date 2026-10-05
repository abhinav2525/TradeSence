// Wording on the Nifty Bank views (decision 0034, final review). Source-level checks:
// these sentences sit inside server components that need the database to render.
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { GLOSSARY } from "../src/lib/glossary";

const breadth = readFileSync("src/app/page.tsx", "utf8");
const ad = readFileSync("src/app/advance-decline/page.tsx", "utf8");

describe("Nifty Bank wording", () => {
  test("Breadth's chart footer keeps the NIFTY 50 sentence and does not call 20% an extreme for Nifty Bank", () => {
    expect(breadth).toContain("The shaded bands mark the extremes: under 20% and over 80%.");
    // with 14 banks, 20% is three banks: not an extreme
    expect(breadth).toMatch(/small\s*\?\s*"The shaded bands mark under 20% and over 80%\."/);
  });

  test("the glossary says the 2020 Nifty Bank list was worked back from today's", () => {
    expect(GLOSSARY["nifty-bank"]!.what).toContain("rebuilt from NSE Indices' press releases, working back from today's list");
  });

  test("Advance/Decline builds the member count from the size schedule, not by editing a phrase", () => {
    expect(ad).not.toContain(".replace(`${ix.label}'s `");
    expect(ad).toContain("With only ${sizeOn(ix.sizes, p.date)} members");
  });
});
