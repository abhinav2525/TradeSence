/** The Top volume page reads volume_leaders joined with today's NSE index lists (spec 2026-10-04). */
import { sql } from "drizzle-orm";
import { db } from "../db";
import type { Period } from "../indicators/volume-leaders";
import { CARD_INDEX_NAMES } from "./card-indices";
import { SIZE_KEYS, UNIVERSE_KEY } from "../ingest/index-constituents";

export type SizeGroup = keyof typeof SIZE_KEYS;
export type RankBy = "value" | "shares" | "busy";
export type LeaderRow = {
  symbol: string; sector: string; size: SizeGroup | null; turnover: number; shares: number;
  changePct: number | null; sessions: number; unusualDays: number; hasCard: boolean;
  normalDaily: number | null; busyRatio: number | null;
};

/** "Unusually busy" ranks only on 1 day / 1 week / 1 month: a 3- or 6-month window's normal is 6–9 months old. */
export const BUSY_PERIODS: readonly Period[] = [1, 5, 21];
/** A stock must usually trade ₹5 crore a day to be ranked by × normal; below it a tiny stock at 40× tops the list. */
export const BUSY_FLOOR_RS = 5e7;

/** The page's `rank` param: exactly "shares", or "busy" on a period that offers it; anything else is ₹ value. */
export function cleanRank(v: string | undefined, period: Period): RankBy {
  return v === "shares" ? "shares" : v === "busy" && BUSY_PERIODS.includes(period) ? "busy" : "value";
}

/**
 * × normal for every row (₹ ÷ (normal ₹ a day × the period's market sessions), never the sessions the
 * stock traded, so a part-suspended week reads lower), then the ranking. For "busy", stocks under the
 * floor or without a normal are left out and counted, after the filters (they are applied to `rows`).
 */
export function rankLeaders<T extends { symbol: string; turnover: number; shares: number; normalDaily: number | null }>(
  rows: T[], rank: RankBy, period: number,
): { rows: (T & { busyRatio: number | null })[]; leftOut: number } {
  const all = rows.map((r) => ({ ...r, busyRatio: r.normalDaily !== null && r.normalDaily > 0 ? r.turnover / (r.normalDaily * period) : null }));
  const kept = rank === "busy" ? all.filter((r) => r.normalDaily !== null && r.normalDaily >= BUSY_FLOOR_RS) : all;
  const key = (r: (typeof all)[number]) => (rank === "value" ? r.turnover : rank === "shares" ? r.shares : r.busyRatio!);
  kept.sort((a, b) => key(b) - key(a) || a.symbol.localeCompare(b.symbol));
  return { rows: kept, leftOut: all.length - kept.length };
}

export async function topVolume(o: { period: Period; rank: RankBy; size: SizeGroup | null; sector: string | null; indexKey: string | null }) {
  const rows = await db.execute<{
    symbol: string; sector: string; size: SizeGroup | null; turnover: number; shares: number; change_pct: number | null;
    sessions: number; unusual_days: number; has_card: boolean; as_of: string; normal_daily: number | null;
  }>(sql`
    select v.symbol, u.industry as sector,
           case when exists (select 1 from index_constituents s where s.index_key = ${SIZE_KEYS.large} and s.symbol = v.symbol) then 'large'
                when exists (select 1 from index_constituents s where s.index_key = ${SIZE_KEYS.mid} and s.symbol = v.symbol) then 'mid'
                when exists (select 1 from index_constituents s where s.index_key = ${SIZE_KEYS.small} and s.symbol = v.symbol) then 'small'
                when exists (select 1 from index_constituents s where s.index_key = ${SIZE_KEYS.micro} and s.symbol = v.symbol) then 'micro' end as size,
           v.turnover, v.shares, v.change_pct, v.sessions, v.unusual_days, v.normal_daily, v.as_of::text as as_of,
           exists (select 1 from index_members m where m.index_name in ${CARD_INDEX_NAMES} and m.symbol = v.symbol) as has_card
    from volume_leaders v
    join index_constituents u on u.index_key = ${UNIVERSE_KEY} and u.symbol = v.symbol
    where v.period = ${o.period}
      ${o.sector ? sql`and u.industry = ${o.sector}` : sql``}
      ${o.indexKey ? sql`and exists (select 1 from index_constituents f where f.index_key = ${o.indexKey} and f.symbol = v.symbol)` : sql``}`);
  const filtered = rows
    .map((r) => ({
      symbol: r.symbol, sector: r.sector, size: r.size, turnover: Number(r.turnover), shares: Number(r.shares),
      changePct: r.change_pct === null ? null : Number(r.change_pct), sessions: Number(r.sessions),
      unusualDays: Number(r.unusual_days), hasCard: r.has_card, normalDaily: r.normal_daily === null ? null : Number(r.normal_daily),
    }))
    .filter((r) => o.size === null || r.size === o.size);
  const { rows: out, leftOut } = rankLeaders(filtered, o.rank, o.period);
  // The date comes from the table, not the rows, so a filter with no match still shows it.
  const [a] = await db.execute<{ d: string | null }>(sql`select max(as_of)::text d from volume_leaders`);
  return { asOf: a?.d ?? null, rows: out satisfies LeaderRow[], leftOut };
}

export async function sectorsPresent(): Promise<string[]> {
  const r = await db.execute<{ industry: string }>(sql`
    select distinct industry from index_constituents where index_key = ${UNIVERSE_KEY} and industry <> '' order by 1`);
  return r.map((x) => x.industry);
}

/**
 * The leaderboard in pages of 100 (decision 0026): all 747 rows made a 2.7 MB
 * page that tripped Next's gzip "MaxListeners" warning and loaded slowly on a
 * phone. A page past the end shows the last one.
 */
export const PAGE_SIZE = 100;
export function pageOfRows<T>(rows: T[], page: number): { rows: T[]; page: number; pages: number; first: number } {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const p = Math.min(Math.max(1, page), pages);
  const first = (p - 1) * PAGE_SIZE;
  return { rows: rows.slice(first, first + PAGE_SIZE), page: p, pages, first: first + 1 };
}
