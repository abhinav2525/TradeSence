import { test, expect, describe } from "bun:test";
import { daysBetween } from "../src/ingest/backfill";
import { fetchBhavcopy } from "../src/ingest/bhavcopy";

describe("daysBetween", () => {
  // NSE trades on some weekends: Budget days, Diwali Muhurat sessions and
  // special DR-test sessions. Skipping weekends lost 10 sessions (decision 0007).
  test("includes Saturday and Sunday", () => {
    // 2026-09-19 is a Saturday, 2026-09-20 a Sunday.
    expect(daysBetween("2026-09-18", "2026-09-22")).toEqual([
      "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22",
    ]);
  });

  test("returns an empty list when the range is inverted", () => {
    expect(daysBetween("2026-09-25", "2026-09-21")).toEqual([]);
  });

  test("returns a single day when start equals end", () => {
    expect(daysBetween("2026-09-20", "2026-09-20")).toEqual(["2026-09-20"]);
  });

  test("spans a year boundary without drifting", () => {
    expect(daysBetween("2023-12-30", "2024-01-02")).toEqual([
      "2023-12-30", "2023-12-31", "2024-01-01", "2024-01-02",
    ]);
  });
});

describe("weekend sessions exist on NSE's archive", () => {
  test("Sunday 1 Feb 2026 (Union Budget) has a bhavcopy", async () => {
    const res = await fetchBhavcopy("2026-02-01");
    expect(res.status).toBe("ok");
  }, 30000);

  test("an ordinary Sunday is a holiday", async () => {
    expect((await fetchBhavcopy("2026-09-20")).status).toBe("holiday");
  }, 30000);
});
