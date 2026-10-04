/**
 * Rebuilds the Money flow tables for every Nifty Total Market stock, through
 * loadAdjustedHistory (renames; EQ and BE, decision 0025), in one transaction:
 * - money_flow: ₹ traded over the last 1/5/21 sessions and the normal before each;
 * - sector_flow_weeks: each sector's 1-week reading for the last 52 weeks;
 * - short_sessions: Muhurat / special-Saturday sessions (market-wide ₹ under half usual).
 */
import { eq, sql as dsql } from "drizzle-orm";
import { db, schema } from "../db";
import { loadAdjustedHistory, loadRenames, type History } from "./history";
import {
  FLOW_PERIODS, HISTORY_WEEKS, NORMAL_SESSIONS, flowStats, flowWindows, marketTotals, shortSessionRows, weekWindows, weeklySectorFlows,
} from "./money-flow";

// 52 weeks + the oldest week's normal + 63 more so shortSessions can judge the oldest week's days
const SESSIONS = HISTORY_WEEKS * 5 + NORMAL_SESSIONS + 63;

/** The part of a history from `from` on: what the weekly history needs, without keeping 10 years per stock. */
function since(h: History, from: string): History {
  const i = h.dates.findIndex((d) => d >= from);
  const k = i < 0 ? h.dates.length : i;
  const cut = <T,>(a: T[]) => a.slice(k);
  return {
    dates: cut(h.dates), open: cut(h.open), high: cut(h.high), low: cut(h.low), close: cut(h.close), volume: cut(h.volume),
    turnover: cut(h.turnover), traded: cut(h.traded), delivered: cut(h.delivered), factors: cut(h.factors), shareFactors: cut(h.shareFactors),
  };
}

export async function computeMoneyFlow(opts: { symbols?: string[] } = {}): Promise<{ rows: number; weeks: number; shortSessions: number; asOf: string | null }> {
  const days = (await db.execute<{ d: string }>(dsql`
    select trade_date::text d from ingest_log where source = 'bhavcopy' and status = 'ok'
    order by trade_date desc limit ${SESSIONS}`)).map((r) => r.d);
  const w = flowWindows(days);
  if (!w) return { rows: 0, weeks: 0, shortSessions: 0, asOf: null };
  const members = await db.select({ symbol: schema.indexConstituents.symbol, sector: schema.indexConstituents.industry })
    .from(schema.indexConstituents).where(eq(schema.indexConstituents.indexKey, "total-market"));
  const wanted = opts.symbols ? members.filter((m) => opts.symbols!.includes(m.symbol)) : members;

  const renames = await loadRenames();
  const oldest = days.at(-1)!;
  const rows: (typeof schema.moneyFlow.$inferInsert)[] = [];
  const kept: { symbol: string; sector: string; h: History }[] = [];
  for (const { symbol, sector } of wanted) {
    const full = await loadAdjustedHistory(symbol, renames, { series: ["EQ", "BE"] });
    if (!full) continue;
    const h = since(full, oldest);
    for (const s of flowStats(h, w)) rows.push({ asOf: w.asOf, symbol, sector, ...s });
    kept.push({ symbol, sector, h });
  }
  const short = shortSessionRows(marketTotals(kept.map((k) => k.h), oldest));
  const weeks = weeklySectorFlows(kept, weekWindows(days), new Set(short.map((s) => s.date)));

  await db.transaction(async (tx) => {
    await tx.delete(schema.moneyFlow);
    await tx.delete(schema.sectorFlowWeeks);
    await tx.delete(schema.shortSessions);
    for (let i = 0; i < rows.length; i += 1000) await tx.insert(schema.moneyFlow).values(rows.slice(i, i + 1000));
    if (weeks.length) await tx.insert(schema.sectorFlowWeeks).values(weeks);
    if (short.length) await tx.insert(schema.shortSessions).values(short.map((s) => ({ tradeDate: s.date, marketTurnover: s.turnover, usualTurnover: s.usual })));
  });
  return { rows: rows.length, weeks: weeks.length, shortSessions: short.length, asOf: w.asOf };
}
