/** The Top volume page reads volume_leaders joined with today's NSE index lists (spec 2026-10-04). */
import { sql } from "drizzle-orm";
import { db } from "../db";
import type { Period } from "../indicators/volume-leaders";
import { INDEX_NAME } from "../ingest/nifty50";
import { SIZE_KEYS, UNIVERSE_KEY } from "../ingest/index-constituents";

export type SizeGroup = keyof typeof SIZE_KEYS;
export type RankBy = "value" | "shares";
export type LeaderRow = {
  symbol: string; sector: string; size: SizeGroup | null; turnover: number; shares: number;
  changePct: number | null; sessions: number; unusualDays: number; hasCard: boolean;
};

export async function topVolume(o: { period: Period; rank: RankBy; size: SizeGroup | null; sector: string | null; indexKey: string | null }) {
  const rows = await db.execute<{
    symbol: string; sector: string; size: SizeGroup | null; turnover: number; shares: number; change_pct: number | null;
    sessions: number; unusual_days: number; has_card: boolean; as_of: string;
  }>(sql`
    select v.symbol, u.industry as sector,
           case when exists (select 1 from index_constituents s where s.index_key = ${SIZE_KEYS.large} and s.symbol = v.symbol) then 'large'
                when exists (select 1 from index_constituents s where s.index_key = ${SIZE_KEYS.mid} and s.symbol = v.symbol) then 'mid'
                when exists (select 1 from index_constituents s where s.index_key = ${SIZE_KEYS.small} and s.symbol = v.symbol) then 'small'
                when exists (select 1 from index_constituents s where s.index_key = ${SIZE_KEYS.micro} and s.symbol = v.symbol) then 'micro' end as size,
           v.turnover, v.shares, v.change_pct, v.sessions, v.unusual_days, v.as_of::text as as_of,
           exists (select 1 from index_members m where m.index_name = ${INDEX_NAME} and m.symbol = v.symbol) as has_card
    from volume_leaders v
    join index_constituents u on u.index_key = ${UNIVERSE_KEY} and u.symbol = v.symbol
    where v.period = ${o.period}
      ${o.sector ? sql`and u.industry = ${o.sector}` : sql``}
      ${o.indexKey ? sql`and exists (select 1 from index_constituents f where f.index_key = ${o.indexKey} and f.symbol = v.symbol)` : sql``}`);
  const out = rows
    .map((r) => ({
      symbol: r.symbol, sector: r.sector, size: r.size, turnover: Number(r.turnover), shares: Number(r.shares),
      changePct: r.change_pct === null ? null : Number(r.change_pct), sessions: Number(r.sessions),
      unusualDays: Number(r.unusual_days), hasCard: r.has_card,
    }))
    .filter((r) => o.size === null || r.size === o.size)
    .sort((a, b) => (o.rank === "value" ? b.turnover - a.turnover : b.shares - a.shares) || a.symbol.localeCompare(b.symbol));
  // The date comes from the table, not the rows, so a filter with no match still shows it.
  const [a] = await db.execute<{ d: string | null }>(sql`select max(as_of)::text d from volume_leaders`);
  return { asOf: a?.d ?? null, rows: out };
}

export async function sectorsPresent(): Promise<string[]> {
  const r = await db.execute<{ industry: string }>(sql`
    select distinct industry from index_constituents where index_key = ${UNIVERSE_KEY} and industry <> '' order by 1`);
  return r.map((x) => x.industry);
}
