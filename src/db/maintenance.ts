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
  "sector_share_year", "index_constituents",
  // upserted nightly
  "breadth_daily", "fund_symbols",
] as const;

/** Left to Postgres's own upkeep: loaded by hand, or small and changed by a few rows a night. */
export const NOT_ANALYZED = ["index_members", "corporate_actions", "symbol_changes"] as const;

export async function analyzeTables(sql: Sql): Promise<void> {
  await sql`analyze ${sql([...NIGHTLY_ANALYZE])}`;
}
