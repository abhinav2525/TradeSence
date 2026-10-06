import { test, expect, describe } from "bun:test";
import { auditWarnings } from "../src/audit/nightly";

const OK = [
  "session 2026-10-01 · 50 members · 1592 numbers compared · 0 mismatches",
  "✓ every number matches the independent recalculation",
].join("\n");

const BAD = [
  "session 2026-10-01 · 50 members · 1592 numbers compared · 2 mismatches",
  "  ✗ INFY sma200: mine=1500.0000 app=1490.0000",
  "  ✗ TCS ret6m: mine=4.0000 app=4.5000",
].join("\n");

describe("auditWarnings", () => {
  test("a clean audit raises no warning", () => {
    expect(auditWarnings(0, OK)).toEqual([]);
  });

  test("each mismatch becomes its own warning line, after a summary", () => {
    expect(auditWarnings(1, BAD)).toEqual([
      "Report Card audit: 2 mismatches on session 2026-10-01 (bun run audit:report-card)",
      "Report Card audit ✗ INFY sma200: mine=1500.0000 app=1490.0000",
      "Report Card audit ✗ TCS ret6m: mine=4.0000 app=4.5000",
    ]);
  });

  test("a long list is cut short so one bad night can't bury the log", () => {
    const many = ["session 2026-10-01 · 50 members · 1592 numbers compared · 25 mismatches",
      ...Array.from({ length: 25 }, (_, i) => `  ✗ S${i} close: mine=1 app=2`)].join("\n");
    const w = auditWarnings(1, many);
    expect(w).toHaveLength(1 + 10 + 1);
    expect(w.at(-1)).toBe("Report Card audit: and 15 more");
  });

  // A crash (bad data, lost connection) must not read as "all fine".
  test("an audit that crashed or printed no summary is a warning, whatever its exit code", () => {
    expect(auditWarnings(2, "TypeError: x is undefined")).toEqual(["Report Card audit did not finish (exit 2)"]);
    expect(auditWarnings(0, "")).toEqual(["Report Card audit did not finish (exit 0)"]);
  });
});

import { auditSummary } from "../src/audit/nightly";

describe("the audit's own summary line (decision 0035)", () => {
  test("the line the audit prints for several indices still parses, with or without mismatches", () => {
    const cards = [{ label: "NIFTY 50", n: 50 }, { label: "Nifty Bank", n: 14 }];
    expect(auditWarnings(0, auditSummary("2026-10-06", cards, 2168, 0))).toEqual([]);
    expect(auditWarnings(1, `${auditSummary("2026-10-06", cards, 2168, 2)}\n  ✗ X`)[0]).toBe(
      "Report Card audit: 2 mismatches on session 2026-10-06 (bun run audit:report-card)",
    );
  });
});

import { auditCards } from "../src/audit/cards";
import { INDICES } from "../src/ingest/indices";

describe("the audit's summary line, exactly (review fix)", () => {
  test("word for word, and the timing line on its own raises nothing", () => {
    const line = auditSummary("2026-10-06", [{ label: "NIFTY 50", n: 50 }, { label: "Nifty Bank", n: 14 }], 2168, 0);
    expect(line).toBe("session 2026-10-06 · 64 cards (NIFTY 50 50, Nifty Bank 14) · 2168 numbers compared · 0 mismatches");
    expect(auditWarnings(0, `${line}\ntook 5.9 s\n✓ every number matches the independent recalculation`)).toEqual([]);
  });
});

describe("auditCards: which cards the audit checks", () => {
  const rows = [
    { index_name: "NIFTY50", symbol: "AAA" }, { index_name: "NIFTYBANK", symbol: "AAA" },
    { index_name: "NIFTYBANK", symbol: "BNK" }, { index_name: "NIFTY50", symbol: "NFX" },
  ];
  test("one card per (index, member); a second index's card is labelled with it", () => {
    expect(auditCards(rows, INDICES).map((c) => [c.label, c.key])).toEqual([
      ["AAA", "nifty50"], ["NFX", "nifty50"], ["AAA [Nifty Bank]", "bank"], ["BNK [Nifty Bank]", "bank"],
    ]);
  });
  test("each card's peers are its index's members on the session", () => {
    const cards = auditCards(rows, INDICES);
    expect(cards.find((c) => c.label === "AAA")!.peers).toEqual(["AAA", "NFX"]);
    expect(cards.find((c) => c.label === "AAA [Nifty Bank]")!.peers).toEqual(["AAA", "BNK"]);
  });
  test("the served default card is the first registered index the stock is in that day", () => {
    const def = auditCards(rows, INDICES).filter((c) => c.isDefault).map((c) => c.label);
    expect(def).toEqual(["AAA", "NFX", "BNK [Nifty Bank]"]); // AAA's Bank card is reached with u=bank
  });
});
