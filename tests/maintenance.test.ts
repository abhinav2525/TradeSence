import { test, expect } from "bun:test";
import { getTableName } from "drizzle-orm";
import { sql, schema } from "../src/db";
import { NIGHTLY_ANALYZE, NOT_ANALYZED, analyzeTables } from "../src/db/maintenance";

test("the nightly ANALYZE covers the big raw tables, not only the rebuilt ones (decision 0029)", () => {
  for (const t of ["daily_prices", "daily_delivery", "index_prices", "ingest_log",
    "daily_indicators", "unusual_days", "volume_leaders", "money_flow", "sector_flow_weeks", "short_sessions", "breadth_daily"]) {
    expect(NIGHTLY_ANALYZE as readonly string[]).toContain(t);
  }
});

test("every table in the schema is either analyzed nightly or left out on purpose", () => {
  // a new table must be placed in one list or the other, so nightly statistics never miss one (0041 review)
  const names: string[] = Object.values(schema).flatMap((v) => { try { return [getTableName(v as never)]; } catch { return []; } });
  const placed = [...NIGHTLY_ANALYZE, ...NOT_ANALYZED] as readonly string[];
  expect(names.filter((n) => !placed.includes(n))).toEqual([]);
  expect(NIGHTLY_ANALYZE.filter((t) => (NOT_ANALYZED as readonly string[]).includes(t))).toEqual([]);
  for (const t of ["sector_share_year", "index_constituents", "fund_symbols"]) {
    expect(NIGHTLY_ANALYZE as readonly string[]).toContain(t);
  }
});

test("every table named exists in the schema, and the ANALYZE runs", async () => {
  const names: string[] = Object.values(schema).flatMap((v) => { try { return [getTableName(v as never)]; } catch { return []; } });
  for (const t of [...NIGHTLY_ANALYZE, ...NOT_ANALYZED]) expect(names).toContain(t);
  await analyzeTables(sql);
});
