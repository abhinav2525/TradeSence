import { sql } from "drizzle-orm";
import { db } from "../db";
import type { MaKind } from "../lib/ma";

// The averages and their labels live in a pure module so browser code can use
// them without this file's database import; re-exported for existing callers.
export { MA_LABELS, type MaKind } from "../lib/ma";

/** The three averages the dashboard offers, mapped to their stored columns. */
export const MA_COLUMNS = {
  sma200: "sma_200",
  ema200: "ema_200",
  sma50: "sma_50",
} as const satisfies Record<MaKind, string>;

export type BreadthPoint = {
  date: string;
  above: number;
  below: number;
  total: number;
  pctAbove: number;
};

export type MemberRow = {
  symbol: string;
  close: number;
  ma: number;
  pctFromMa: number;
};

function column(ma: MaKind) {
  // Values come from a fixed map, never from user input. The explicit check
  // matters because TypeScript's types are erased and this is the one place in
  // the codebase that builds raw SQL.
  const col = MA_COLUMNS[ma];
  if (!col) throw new Error(`Unknown moving average: ${ma}`);
  return sql.raw(col);
}

/**
 * Membership is evaluated per trade date, so a properly populated
 * `index_members` table yields point-in-time-correct breadth with no change
 * here. Symbols whose average is still null (too little history) are excluded
 * rather than counted as "below" — otherwise every backfill would open with a
 * fake bearish reading.
 */
export async function breadthSeries(
  ma: MaKind,
  indexName = "NIFTY50",
): Promise<BreadthPoint[]> {
  const col = column(ma);
  const rows = await db.execute<{
    date: string; above: number; below: number; total: number;
  }>(sql`
    select i.trade_date                                        as date,
           count(distinct i.symbol) filter (where i.close >  i.${col})::int as above,
           count(distinct i.symbol) filter (where i.close <= i.${col})::int as below,
           count(distinct i.symbol)::int                                    as total
    from daily_indicators i
    join index_members m
      on m.symbol = i.symbol
     and m.index_name = ${indexName}
     and i.trade_date >= m.added_on
     and (m.removed_on is null or i.trade_date < m.removed_on)
    where i.${col} is not null
    group by i.trade_date
    order by i.trade_date asc
  `);

  return rows.map((r) => ({
    date: r.date,
    above: Number(r.above),
    below: Number(r.below),
    total: Number(r.total),
    pctAbove: Number(r.total) === 0 ? 0 : (Number(r.above) / Number(r.total)) * 100,
  }));
}

/**
 * True when `i.symbol` was in the index on `i.trade_date`. Without it, date
 * navigation would offer days before the membership history starts (2020),
 * where every list is empty.
 */
function isMemberThen(indexName: string) {
  return sql`exists (
    select 1 from index_members m
    where m.symbol = i.symbol and m.index_name = ${indexName}
      and i.trade_date >= m.added_on
      and (m.removed_on is null or i.trade_date < m.removed_on))`;
}

/**
 * Turns a requested date into an actual trading session.
 *
 * Weekends, exchange holidays and future dates all snap *backwards* to the most
 * recent session at or before the request, which is what someone typing a date
 * into a box expects. A date earlier than all the data has nothing to snap to
 * and returns null.
 */
export async function resolveSession(
  ma: MaKind,
  dateIso?: string,
  indexName = "NIFTY50",
): Promise<string | null> {
  const col = column(ma);
  const rows = await db.execute<{ d: string | null }>(sql`
    select max(i.trade_date)::text as d
    from daily_indicators i
    where i.${col} is not null and ${isMemberThen(indexName)}
      ${dateIso ? sql`and i.trade_date <= ${dateIso}` : sql``}
  `);
  return rows[0]?.d ?? null;
}

/** The trading sessions immediately before and after a given one. */
export async function adjacentSessions(
  ma: MaKind,
  dateIso: string,
  indexName = "NIFTY50",
): Promise<{ prev: string | null; next: string | null }> {
  const col = column(ma);
  const rows = await db.execute<{ prev: string | null; next: string | null }>(sql`
    select
      (select max(i.trade_date)::text from daily_indicators i
        where i.${col} is not null and ${isMemberThen(indexName)} and i.trade_date < ${dateIso}) as prev,
      (select min(i.trade_date)::text from daily_indicators i
        where i.${col} is not null and ${isMemberThen(indexName)} and i.trade_date > ${dateIso}) as next
  `);
  return { prev: rows[0]?.prev ?? null, next: rows[0]?.next ?? null };
}

export type Breakdown = {
  /** The session actually shown. */
  date: string | null;
  /** What the caller asked for, which may not have been a trading day. */
  requested: string | null;
  /** True when the request was moved back to an earlier session. */
  snapped: boolean;
  above: MemberRow[];
  below: MemberRow[];
};

/**
 * One session, split into the two lists the page shows.
 *
 * Omitting the date gives the newest session, which is what the dashboard
 * showed before dates were selectable — so existing callers are unaffected.
 */
export async function breakdownOn(
  ma: MaKind,
  dateIso?: string,
  indexName = "NIFTY50",
): Promise<Breakdown> {
  const col = column(ma);
  const session = await resolveSession(ma, dateIso, indexName);

  if (!session) {
    return { date: null, requested: dateIso ?? null, snapped: false, above: [], below: [] };
  }

  const rows = await db.execute<{ symbol: string; close: number; ma: number }>(sql`
    select distinct on (i.symbol) i.symbol, i.close, i.${col} as ma
    from daily_indicators i
    join index_members m
      on m.symbol = i.symbol
     and m.index_name = ${indexName}
     and i.trade_date >= m.added_on
     and (m.removed_on is null or i.trade_date < m.removed_on)
    where i.trade_date = ${session} and i.${col} is not null
    order by i.symbol
  `);

  const mapped: MemberRow[] = rows.map((r) => {
    const close = Number(r.close);
    const maVal = Number(r.ma);
    return { symbol: r.symbol, close, ma: maVal, pctFromMa: ((close - maVal) / maVal) * 100 };
  });

  return {
    date: session,
    requested: dateIso ?? null,
    snapped: dateIso !== undefined && dateIso !== session,
    // strongest first above the line, weakest first below it
    above: mapped.filter((r) => r.pctFromMa > 0).sort((a, b) => b.pctFromMa - a.pctFromMa),
    below: mapped.filter((r) => r.pctFromMa <= 0).sort((a, b) => a.pctFromMa - b.pctFromMa),
  };
}

/** Back-compatible alias: the newest session. */
export async function latestBreakdown(ma: MaKind, indexName = "NIFTY50") {
  return breakdownOn(ma, undefined, indexName);
}

/**
 * Breadth for the whole market or an NSE index list, from the nightly breadth_daily
 * table (decision 0030); the NIFTY 50 keeps breadthSeries. `ma` is a bound value, not
 * a column name, so no raw SQL is involved.
 */
export async function universeSeries(universe: string, ma: MaKind): Promise<BreadthPoint[]> {
  const rows = await db.execute<{ date: string; above: number; total: number }>(sql`
    select trade_date::text as date, above, total from breadth_daily
    where universe = ${universe} and ma = ${ma} and total > 0 order by trade_date`);
  return rows.map((r) => {
    const above = Number(r.above), total = Number(r.total);
    return { date: r.date, above, below: total - above, total, pctAbove: (above / total) * 100 };
  });
}
