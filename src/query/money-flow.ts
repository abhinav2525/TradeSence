/** The Money flow page reads money_flow (rebuilt nightly; spec 2026-10-05) and sums per sector with sectorFlows. */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { INDEX_NAME } from "../ingest/nifty50";
import type { FlowPeriod, FlowRow } from "../indicators/money-flow";

export async function moneyFlowRows(period: FlowPeriod): Promise<{ asOf: string | null; rows: FlowRow[] }> {
  const rows = await db.execute<{ symbol: string; sector: string; turnover: number; normal_daily: number | null; change_pct: number | null }>(sql`
    select symbol, sector, turnover, normal_daily, change_pct from money_flow where period = ${period}`);
  // The date comes from the table, not the rows, so an empty period still shows it.
  const [a] = await db.execute<{ d: string | null }>(sql`select max(as_of)::text d from money_flow`);
  return {
    asOf: a?.d ?? null,
    rows: rows.map((r) => ({
      symbol: r.symbol, sector: r.sector, turnover: Number(r.turnover),
      normalDaily: r.normal_daily === null ? null : Number(r.normal_daily),
      changePct: r.change_pct === null ? null : Number(r.change_pct),
    })),
  };
}

/** Of these symbols, the ones with a Report Card (ever in the NIFTY 50), so the drill-down can link to them. */
export async function withReportCard(symbols: string[]): Promise<Set<string>> {
  if (symbols.length === 0) return new Set();
  const r = await db.execute<{ symbol: string }>(sql`
    select distinct symbol from index_members where index_name = ${INDEX_NAME}
    and symbol in (${sql.join(symbols.map((s) => sql`${s}`), sql`, `)})`);
  return new Set(r.map((x) => x.symbol));
}
