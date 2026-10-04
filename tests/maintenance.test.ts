import { test, expect } from "bun:test";
import { getTableName } from "drizzle-orm";
import { sql, schema } from "../src/db";
import { NIGHTLY_ANALYZE, analyzeTables } from "../src/db/maintenance";

test("the nightly ANALYZE covers the big raw tables, not only the rebuilt ones (decision 0029)", () => {
  for (const t of ["daily_prices", "daily_delivery", "index_prices", "ingest_log",
    "daily_indicators", "unusual_days", "volume_leaders", "money_flow", "sector_flow_weeks", "short_sessions", "breadth_daily"]) {
    expect(NIGHTLY_ANALYZE as readonly string[]).toContain(t);
  }
});

test("every table named exists in the schema, and the ANALYZE runs", async () => {
  const names: string[] = Object.values(schema).flatMap((v) => { try { return [getTableName(v as never)]; } catch { return []; } });
  for (const t of NIGHTLY_ANALYZE) expect(names).toContain(t);
  await analyzeTables(sql);
});
