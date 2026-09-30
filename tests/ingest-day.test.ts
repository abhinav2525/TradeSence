import { test, expect, describe, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import { db, schema, sql } from "../src/db";
import { ingestDay } from "../src/ingest/ingest-day";

const TRADING_DAY = "2026-09-25";
const SUNDAY = "2026-09-20";

async function clear() {
  await db.delete(schema.dailyPrices);
  await db.delete(schema.ingestLog);
}

describe("ingestDay", () => {
  beforeEach(clear);

  test("stores a trading day's prices and logs it as ok", async () => {
    const result = await ingestDay(TRADING_DAY);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.rowCount).toBeGreaterThan(1000);

    const rows = await db
      .select()
      .from(schema.dailyPrices)
      .where(eq(schema.dailyPrices.symbol, "RELIANCE"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tradeDate).toBe(TRADING_DAY);
    expect(rows[0]!.close).toBeGreaterThan(0);

    const log = await db.select().from(schema.ingestLog);
    expect(log).toHaveLength(1);
    expect(log[0]!.status).toBe("ok");
    expect(log[0]!.format).toBe("udiff");
  }, 60000);

  test("is idempotent: re-ingesting the same day adds no rows", async () => {
    await ingestDay(TRADING_DAY);
    const [before] = await sql`select count(*)::int as n from daily_prices`;
    // force, so this actually re-runs the upsert rather than short-circuiting
    await ingestDay(TRADING_DAY, { force: true });
    const [after] = await sql`select count(*)::int as n from daily_prices`;
    expect(after!.n).toBe(before!.n);

    const log = await db.select().from(schema.ingestLog);
    expect(log).toHaveLength(1);
  }, 90000);

  test("records a holiday without writing any price rows", async () => {
    const result = await ingestDay(SUNDAY);
    expect(result.status).toBe("holiday");

    const [{ n }] = await sql`select count(*)::int as n from daily_prices`;
    expect(n).toBe(0);

    const log = await db.select().from(schema.ingestLog);
    expect(log).toHaveLength(1);
    expect(log[0]!.status).toBe("holiday");
  }, 60000);

  test("skips work when the day is already logged", async () => {
    await ingestDay(TRADING_DAY);
    const result = await ingestDay(TRADING_DAY);
    expect(result.status).toBe("skipped");
  }, 90000);
});
