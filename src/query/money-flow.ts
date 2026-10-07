/** The Money flow page reads money_flow (rebuilt nightly; spec 2026-10-05) and sums per sector with sectorFlows. */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { CARD_INDEX_NAMES } from "./card-indices";
import type { FlowPeriod, FlowRow, ShareBlocks, ShareYearRow } from "../indicators/money-flow";

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

/** Of these symbols, the ones with a Report Card (ever in a registered index, decision 0035), so the drill-down can link to them. */
export async function withReportCard(symbols: string[]): Promise<Set<string>> {
  if (symbols.length === 0) return new Set();
  const r = await db.execute<{ symbol: string }>(sql`
    select distinct symbol from index_members where index_name in ${CARD_INDEX_NAMES}
    and symbol in (${sql.join(symbols.map((s) => sql`${s}`), sql`, `)})`);
  return new Set(r.map((x) => x.symbol));
}

/** Short special sessions inside the last `period` market sessions (Money flow and Top volume), from the nightly short_sessions table. */
export async function shortSessionsIn(period: number): Promise<string[]> {
  const days = (await db.execute<{ d: string }>(sql`
    select trade_date::text d from ingest_log where source = 'bhavcopy' and status = 'ok'
    order by trade_date desc limit ${period}`)).map((r) => r.d);
  if (days.length < period) return [];
  const r = await db.execute<{ d: string }>(sql`
    select trade_date::text d from short_sessions where trade_date >= ${days.at(-1)!} order by 1`);
  return r.map((x) => x.d);
}

export type HistoryPoint = { weekEnd: string; ratio: number | null; medianMove: number | null; shortSession: boolean; sharePct: number | null };

const sharePct = (turnover: number, total: number) => (Number(total) > 0 ? (100 * Number(turnover)) / Number(total) : null);

/** One sector's weekly trading vs normal and share of all trading, oldest first (sector_flow_weeks, keyed by sector then week). */
export async function sectorHistory(sector: string): Promise<HistoryPoint[]> {
  const r = await db.execute<{ week_end: string; ratio: number | null; median_move: number | null; short_session: boolean; turnover: number; total_turnover: number }>(sql`
    select week_end::text, ratio, median_move, short_session, turnover, total_turnover from sector_flow_weeks where sector = ${sector} order by week_end`);
  return r.map((x) => ({
    weekEnd: x.week_end, ratio: x.ratio === null ? null : Number(x.ratio),
    medianMove: x.median_move === null ? null : Number(x.median_move), shortSession: x.short_session,
    sharePct: sharePct(x.turnover, x.total_turnover),
  }));
}

export type SharePoint = { weekEnd: string; sharePct: number | null };

/** Every sector's weekly share of all trading in %, oldest first: the Share-of-trading card's small lines (one query). */
export async function shareHistory(): Promise<Map<string, SharePoint[]>> {
  const r = await db.execute<{ sector: string; week_end: string; turnover: number; total_turnover: number }>(sql`
    select sector, week_end::text, turnover, total_turnover from sector_flow_weeks order by sector, week_end`);
  const out = new Map<string, SharePoint[]>();
  for (const x of r) (out.get(x.sector) ?? out.set(x.sector, []).get(x.sector)!).push({ weekEnd: x.week_end, sharePct: sharePct(x.turnover, x.total_turnover) });
  return out;
}

/** The nightly sector_share_year rows and their two blocks; null when empty (under a year of history). */
export async function shareYear(): Promise<{ blocks: ShareBlocks; rows: ShareYearRow[] } | null> {
  const r = await db.execute<{
    sector: string; stocks: number; now_turnover: number; now_total: number; ago_turnover: number; ago_total: number;
    new_listing_turnover: number; demerged: { symbol: string; exDate: string }[]; now_from: string; now_to: string; ago_from: string; ago_to: string;
  }>(sql`
    select sector, stocks, now_turnover, now_total, ago_turnover, ago_total, new_listing_turnover, demerged,
           now_from::text, now_to::text, ago_from::text, ago_to::text
    from sector_share_year order by sector`);
  const first = r[0];
  if (!first) return null;
  return {
    blocks: { nowFrom: first.now_from, nowTo: first.now_to, agoFrom: first.ago_from, agoTo: first.ago_to },
    rows: r.map((x) => ({
      sector: x.sector, stocks: Number(x.stocks), nowTurnover: Number(x.now_turnover), nowTotal: Number(x.now_total),
      agoTurnover: Number(x.ago_turnover), agoTotal: Number(x.ago_total), newListingTurnover: Number(x.new_listing_turnover),
      demerged: (x.demerged ?? []).map((d) => ({ symbol: String(d.symbol), exDate: String(d.exDate) })),
    })),
  };
}
