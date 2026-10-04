/**
 * Nightly planner-statistics refresh (decision 0029). Rebuilt tables are replaced in
 * full, and the big raw tables only get an automatic ANALYZE after ~10% of their rows
 * change (about 475k rows, ~200 sessions, for daily_prices), and not at all for a while
 * after a crash wipes the activity counters. ANALYZE samples ~30k rows: under a second.
 */
import type { Sql } from "postgres";

export const NIGHTLY_ANALYZE = [
  // raw, appended to nightly
  "daily_prices", "daily_delivery", "index_prices", "ingest_log",
  // derived, replaced in full nightly
  "daily_indicators", "unusual_days", "volume_leaders", "money_flow", "sector_flow_weeks", "short_sessions",
] as const;

export async function analyzeTables(sql: Sql): Promise<void> {
  await sql`analyze ${sql([...NIGHTLY_ANALYZE])}`;
}
