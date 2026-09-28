import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { isSettled } from "../src/ingest/ingest-day";

const SOURCE = "bhavcopy";

async function log(tradeDate: string, status: string, fetchedAt: Date) {
  await db.insert(schema.ingestLog).values({
    tradeDate, source: SOURCE, status, format: null, rowCount: null, fetchedAt,
  });
}

describe("isSettled", () => {
  beforeEach(async () => { await db.delete(schema.ingestLog); });

  test("treats ok as settled regardless of when it was fetched", async () => {
    await log("2026-09-25", "ok", new Date("2026-09-25T13:00:00Z"));
    expect(await isSettled("2026-09-25")).toBe(true);
  });

  test("treats error as never settled", async () => {
    await log("2026-09-25", "error", new Date("2030-01-01T00:00:00Z"));
    expect(await isSettled("2026-09-25")).toBe(false);
  });

  /**
   * C1: NSE returns 404 for a not-yet-published file exactly as it does for a
   * holiday. A 'holiday' recorded soon after the session is a guess, not a
   * fact, so it must be re-checked rather than cached forever.
   */
  test("treats a holiday recorded on the session day itself as provisional", async () => {
    await log("2026-09-25", "holiday", new Date("2026-09-25T14:00:00Z"));
    expect(await isSettled("2026-09-25")).toBe(false);
  });

  test("treats a holiday recorded well after the session as settled", async () => {
    await log("2026-09-25", "holiday", new Date("2026-10-05T00:00:00Z"));
    expect(await isSettled("2026-09-25")).toBe(true);
  });

  test("treats an unlogged day as not settled", async () => {
    expect(await isSettled("2026-09-24")).toBe(false);
  });
});
