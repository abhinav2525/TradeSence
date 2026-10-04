/** The Money flow page reads money_flow (rebuilt nightly; spec 2026-10-05) and sums per sector with sectorFlows. */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { INDEX_NAME } from "../ingest/nifty50";
import { FLOW_PERIODS, NORMAL_SESSIONS, shortSessions, type FlowPeriod, type FlowRow } from "../indicators/money-flow";

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

/**
 * Short special sessions (Muhurat, special Saturdays) inside the period's window,
 * judged on the universe's market-wide ₹ per session, so the page can say why every
 * sector looks quiet. Renamed stocks' old symbols are left out: negligible in a total.
 */
export async function shortSessionsIn(period: FlowPeriod): Promise<string[]> {
  const days = (await db.execute<{ d: string }>(sql`
    select trade_date::text d from ingest_log where source = 'bhavcopy' and status = 'ok'
    order by trade_date desc limit ${FLOW_PERIODS.at(-1)! + NORMAL_SESSIONS}`)).map((r) => r.d);
  if (days.length < period) return [];
  const totals = await db.execute<{ d: string; t: number }>(sql`
    select p.trade_date::text d, sum(p.turnover) t from daily_prices p
    join index_constituents u on u.index_key = 'total-market' and u.symbol = p.symbol
    where p.series in ('EQ', 'BE') and p.trade_date >= ${days.at(-1)!}
    group by 1 order by 1`);
  const start = days[period - 1]!;
  return shortSessions(totals.map((x) => ({ date: x.d, turnover: Number(x.t) }))).filter((d) => d >= start);
}
