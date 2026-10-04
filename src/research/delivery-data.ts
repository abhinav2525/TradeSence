/** Database reads for research 0003. */
import { sql } from "drizzle-orm";
import { db } from "../db";

/** Trading days (bhavcopy 'ok') from `from`, ascending. */
export async function tradingDays(from: string): Promise<string[]> {
  const rows = await db.execute<{ d: string }>(sql`
    select trade_date::text as d from ingest_log
    where source = 'bhavcopy' and status = 'ok' and trade_date >= ${from} order by 1`);
  return rows.map((r) => r.d);
}
