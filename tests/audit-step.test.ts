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
