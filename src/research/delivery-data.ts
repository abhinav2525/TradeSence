/** Database reads for research 0003. */
import { sql } from "drizzle-orm";
import { db } from "../db";

/**
 * Every company with EQ prices, once, under its latest symbol: a symbol whose
 * every row predates a rename away from it is an old name, loaded through the
 * new symbol's lineage. A ticker reused after its rename has later rows and stays.
 */
export async function companies(): Promise<string[]> {
  const rows = await db.execute<{ symbol: string }>(sql`
    select s.symbol from (select symbol, max(trade_date) as last from daily_prices where series = 'EQ' group by symbol) s
    where not exists (
      select 1 from symbol_changes c where c.old_symbol = s.symbol and s.last < c.changed_on
    )
    order by s.symbol`);
  return rows.map((r) => r.symbol);
}

/** Trading days (bhavcopy 'ok') from `from`, ascending. */
export async function tradingDays(from: string): Promise<string[]> {
  const rows = await db.execute<{ d: string }>(sql`
    select trade_date::text as d from ingest_log
    where source = 'bhavcopy' and status = 'ok' and trade_date >= ${from} order by 1`);
  return rows.map((r) => r.d);
}
