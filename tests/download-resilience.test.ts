import { test, expect, describe, beforeEach } from "bun:test";
import { download } from "../src/ingest/bhavcopy";
import { db, schema, sql } from "../src/db";
import { ingestDay } from "../src/ingest/ingest-day";

describe("download", () => {
  test("classifies a refused connection as failed, without throwing", async () => {
    // port 9 (discard) is closed locally -> connection refused, fast and deterministic
    const res = await download("http://127.0.0.1:9/nope.zip", { retries: 2, timeoutMs: 300 });
    expect(res.kind).toBe("failed");
  }, 20000);

  test("retries a failing request before giving up", async () => {
    const t0 = Date.now();
    await download("http://127.0.0.1:9/nope.zip", { retries: 2, timeoutMs: 300, backoffMs: 150 });
    // two retries means at least two backoff sleeps happened
    expect(Date.now() - t0).toBeGreaterThanOrEqual(300);
  }, 20000);

  test("classifies a real 404 as notfound, not failed", async () => {
    const res = await download(
      "https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_20260920_F_0000.csv.zip",
      { retries: 0 },
    );
    expect(res.kind).toBe("notfound");
  }, 30000);

  test("returns bytes for a real trading day", async () => {
    const res = await download(
      "https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_20260925_F_0000.csv.zip",
      { retries: 1 },
    );
    expect(res.kind).toBe("ok");
    if (res.kind === "ok") expect(res.bytes.byteLength).toBeGreaterThan(10000);
  }, 30000);
});

describe("ingestDay resume semantics", () => {
  beforeEach(async () => {
    await db.delete(schema.dailyPrices);
    await db.delete(schema.ingestLog);
  });

  test("retries a day previously logged as error instead of skipping it", async () => {
    // simulate a run that died mid-fetch
    await db.insert(schema.ingestLog).values({
      tradeDate: "2026-09-25", source: "bhavcopy", status: "error", format: null, rowCount: null,
    });

    const result = await ingestDay("2026-09-25");
    expect(result.status).toBe("ok");

    const [{ n }] = await sql`select count(*)::int as n from daily_prices`;
    expect(n).toBeGreaterThan(1000);
  }, 60000);

  test("still skips a day already logged ok", async () => {
    await db.insert(schema.ingestLog).values({
      tradeDate: "2026-09-25", source: "bhavcopy", status: "ok", format: "udiff", rowCount: 2000,
    });
    expect((await ingestDay("2026-09-25")).status).toBe("skipped");
  }, 20000);

  test("still skips a day already logged holiday", async () => {
    await db.insert(schema.ingestLog).values({
      tradeDate: "2026-09-20", source: "bhavcopy", status: "holiday", format: null, rowCount: 0,
    });
    expect((await ingestDay("2026-09-20")).status).toBe("skipped");
  }, 20000);
});
