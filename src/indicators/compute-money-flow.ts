/**
 * Rebuilds `money_flow` for every Nifty Total Market stock: ₹ traded over the last
 * 1/5/21 market sessions and its normal over the 63 before each window, through
 * loadAdjustedHistory (renames; EQ and BE, decision 0025). One transaction.
 */
import { eq, sql as dsql } from "drizzle-orm";
import { db, schema } from "../db";
import { loadAdjustedHistory, loadRenames } from "./history";
import { FLOW_PERIODS, NORMAL_SESSIONS, flowStats, flowWindows } from "./money-flow";

export async function computeMoneyFlow(opts: { symbols?: string[] } = {}): Promise<{ rows: number; asOf: string | null }> {
  const days = (await db.execute<{ d: string }>(dsql`
    select trade_date::text d from ingest_log where source = 'bhavcopy' and status = 'ok'
    order by trade_date desc limit ${FLOW_PERIODS.at(-1)! + NORMAL_SESSIONS}`)).map((r) => r.d);
  const w = flowWindows(days);
  if (!w) return { rows: 0, asOf: null };
  const members = await db.select({ symbol: schema.indexConstituents.symbol, sector: schema.indexConstituents.industry })
    .from(schema.indexConstituents).where(eq(schema.indexConstituents.indexKey, "total-market"));
  const wanted = opts.symbols ? members.filter((m) => opts.symbols!.includes(m.symbol)) : members;

  const renames = await loadRenames();
  const rows: (typeof schema.moneyFlow.$inferInsert)[] = [];
  for (const { symbol, sector } of wanted) {
    const h = await loadAdjustedHistory(symbol, renames, { series: ["EQ", "BE"] });
    if (!h) continue;
    for (const s of flowStats(h, w)) rows.push({ asOf: w.asOf, symbol, sector, ...s });
  }
  await db.transaction(async (tx) => {
    await tx.delete(schema.moneyFlow);
    for (let i = 0; i < rows.length; i += 1000) await tx.insert(schema.moneyFlow).values(rows.slice(i, i + 1000));
  });
  return { rows: rows.length, asOf: w.asOf };
}
