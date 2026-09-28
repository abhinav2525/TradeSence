import { test, expect, describe } from "bun:test";
import { backfill } from "../src/ingest/backfill";

describe("backfill survives a failing day", () => {
  test("counts a thrown error and keeps going", async () => {
    const seen: string[] = [];
    const tally = await backfill("2026-09-21", "2026-09-25", {
      delayMs: 0,
      ingest: async (date) => {
        seen.push(date);
        // the real crash was a Postgres 22008 thrown from inside ingestDay
        if (date === "2026-09-23") throw new Error("date/time field value out of range");
        return { status: "ok", rowCount: 10, format: "udiff" };
      },
    });

    expect(seen).toHaveLength(5);          // did not stop at the failure
    expect(tally.error).toBe(1);
    expect(tally.ok).toBe(4);
  });

  test("surfaces the failing date to the progress callback", async () => {
    const failures: string[] = [];
    await backfill("2026-09-21", "2026-09-22", {
      delayMs: 0,
      ingest: async (date) => {
        if (date === "2026-09-22") throw new Error("boom");
        return { status: "ok", rowCount: 1, format: "udiff" };
      },
      onProgress: ({ date, result }) => {
        if (result.status === "error") failures.push(date);
      },
    });
    expect(failures).toEqual(["2026-09-22"]);
  });
});
