/**
 * The Unusual activity page and the Report Card's "Unusual days" card read
 * unusual_days (rebuilt nightly). Spec: docs/superpowers/specs/2026-10-04-unusual-activity-design.md.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { KINDS, isBigJump, unusualScore, type Kind, type UnusualRow } from "../indicators/activity";
import { NIFTY50, NIFTY_BANK } from "../ingest/indices";

/** `all`, or a registered index's key (its members on that date; decision 0034). */
export type ActivitySet = "all" | typeof NIFTY50.key | typeof NIFTY_BANK.key;
const SET_INDEX = { nifty50: NIFTY50.members, bank: NIFTY_BANK.members } as const;
// member: in the set's index on that date (the switch; the NIFTY 50 for "all" and the
// Report Card). hasCard: ever in the NIFTY 50, so its Report Card exists and the row
// can link to it (Report Cards for Nifty Bank members come in step B).
export type ActivityRow = UnusualRow & { symbol: string; member: boolean; hasCard: boolean; score: number };

type Raw = {
  trade_date: string; symbol: string; kept: boolean; volume: boolean; jump: boolean; collapse: boolean;
  kept_ratio: number | null; volume_ratio: number | null; delivery_pct: number | null; usual_delivery_pct: number | null;
  change_pct: number | null; turnover: number; member: boolean; has_card: boolean;
};
const num = (v: number | null) => (v === null ? null : Number(v));
function toRow(r: Raw): ActivityRow {
  const base = {
    tradeDate: r.trade_date, symbol: r.symbol, kept: r.kept, volume: r.volume, jump: r.jump, collapse: r.collapse,
    keptRatio: num(r.kept_ratio), volumeRatio: num(r.volume_ratio), deliveryPct: num(r.delivery_pct),
    usualDeliveryPct: num(r.usual_delivery_pct), changePct: num(r.change_pct), turnover: Number(r.turnover), member: r.member,
    hasCard: r.has_card,
  };
  return { ...base, score: unusualScore(base) };
}

const selectFor = (memberOf: string) => sql`
  select u.trade_date::text, u.symbol, u.kept, u.volume, u.jump, u.collapse, u.kept_ratio, u.volume_ratio,
         u.delivery_pct, u.usual_delivery_pct, u.change_pct, u.turnover,
         exists (select 1 from index_members m where m.index_name = ${memberOf} and m.symbol = u.symbol
                 and u.trade_date >= m.added_on and (m.removed_on is null or u.trade_date < m.removed_on)) as member,
         exists (select 1 from index_members m where m.index_name = ${NIFTY50.members} and m.symbol = u.symbol) as has_card
  from unusual_days u`;
const select = selectFor(NIFTY50.members);

export async function activitySession(dateIso?: string): Promise<string | null> {
  const r = await db.execute<{ d: string | null }>(sql`
    select max(trade_date)::text as d from unusual_days ${dateIso ? sql`where trade_date <= ${dateIso}` : sql``}`);
  return r[0]?.d ?? null;
}

export async function activityNeighbours(dateIso: string): Promise<{ prev: string | null; next: string | null }> {
  const r = await db.execute<{ prev: string | null; next: string | null }>(sql`
    select (select max(trade_date)::text from unusual_days where trade_date < ${dateIso}) as prev,
           (select min(trade_date)::text from unusual_days where trade_date > ${dateIso}) as next`);
  return { prev: r[0]?.prev ?? null, next: r[0]?.next ?? null };
}

export async function activityFirst(): Promise<string | null> {
  const r = await db.execute<{ d: string | null }>(sql`select min(trade_date)::text as d from unusual_days`);
  return r[0]?.d ?? null;
}

export async function activityOn(dateIso: string, set: ActivitySet): Promise<ActivityRow[]> {
  const memberOf = set === "all" ? NIFTY50.members : SET_INDEX[set];
  const rows = (await db.execute<Raw>(sql`${selectFor(memberOf)} where u.trade_date = ${dateIso}`)).map(toRow);
  return rows
    .filter((r) => set === "all" || r.member)
    .sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
}

export function kindCounts(rows: ActivityRow[]): Record<Kind, number> {
  return Object.fromEntries(KINDS.map((k) => [k, rows.filter((r) => r[k]).length])) as Record<Kind, number>;
}

export function filterKinds(rows: ActivityRow[], kinds: readonly Kind[]): ActivityRow[] {
  return rows.filter((r) => kinds.some((k) => r[k]));
}

/** Only rows whose price rose BIG_JUMP_PCT or more that day (the "Big price jumps" filter). */
export function filterBigJumps<T extends { changePct: number | null }>(rows: T[]): T[] {
  return rows.filter((r) => isBigJump(r.changePct));
}

export async function recentUnusual(symbol: string, toDate: string, days = 92): Promise<ActivityRow[]> {
  return (await db.execute<Raw>(sql`${select}
    where u.symbol = ${symbol} and u.trade_date <= ${toDate} and u.trade_date > ${toDate}::date - ${days}::int
    order by u.trade_date desc`)).map(toRow);
}
