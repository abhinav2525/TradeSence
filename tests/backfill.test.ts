import { test, expect, describe } from "bun:test";
import { weekdaysBetween } from "../src/ingest/backfill";

describe("weekdaysBetween", () => {
  test("skips Saturday and Sunday", () => {
    // 2026-09-19 is a Saturday, 2026-09-20 a Sunday.
    expect(weekdaysBetween("2026-09-18", "2026-09-22")).toEqual([
      "2026-09-18", "2026-09-21", "2026-09-22",
    ]);
  });

  test("includes both endpoints when they are weekdays", () => {
    const out = weekdaysBetween("2026-09-21", "2026-09-25");
    expect(out[0]).toBe("2026-09-21");
    expect(out.at(-1)).toBe("2026-09-25");
    expect(out).toHaveLength(5);
  });

  test("returns an empty list when the range is inverted", () => {
    expect(weekdaysBetween("2026-09-25", "2026-09-21")).toEqual([]);
  });

  test("returns a single day when start equals end and it is a weekday", () => {
    expect(weekdaysBetween("2026-09-25", "2026-09-25")).toEqual(["2026-09-25"]);
  });

  test("returns nothing when start equals end and it is a weekend", () => {
    expect(weekdaysBetween("2026-09-20", "2026-09-20")).toEqual([]);
  });

  test("spans a year boundary without drifting", () => {
    const out = weekdaysBetween("2023-12-28", "2024-01-02");
    expect(out).toEqual(["2023-12-28", "2023-12-29", "2024-01-01", "2024-01-02"]);
  });
});
