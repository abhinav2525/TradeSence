import { sql } from "drizzle-orm";
import { db } from "../db";

/** The three averages the dashboard offers, mapped to their stored columns. */
export const MA_COLUMNS = {
  sma200: "sma_200",
  ema200: "ema_200",
  sma50: "sma_50",
} as const;

export type MaKind = keyof typeof MA_COLUMNS;

export const MA_LABELS: Record<MaKind, string> = {
  sma200: "200-day SMA",
  ema200: "200-day EMA",
  sma50: "50-day SMA",
};

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
  // Values come from a fixed map, never from user input.
  return sql.raw(MA_COLUMNS[ma]);
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
           count(*) filter (where i.close >  i.${col})::int     as above,
           count(*) filter (where i.close <= i.${col})::int     as below,
           count(*)::int                                        as total
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

/** The most recent session, split into the two lists the page shows. */
export async function latestBreakdown(
  ma: MaKind,
  indexName = "NIFTY50",
): Promise<{ date: string | null; above: MemberRow[]; below: MemberRow[] }> {
  const col = column(ma);
  const rows = await db.execute<{
    trade_date: string; symbol: string; close: number; ma: number;
  }>(sql`
    with latest as (
      select max(i.trade_date) as d
      from daily_indicators i
      where i.${col} is not null
    )
    select i.trade_date, i.symbol, i.close, i.${col} as ma
    from daily_indicators i
    join latest l on i.trade_date = l.d
    join index_members m
      on m.symbol = i.symbol
     and m.index_name = ${indexName}
     and i.trade_date >= m.added_on
     and (m.removed_on is null or i.trade_date < m.removed_on)
    where i.${col} is not null
  `);

  if (rows.length === 0) return { date: null, above: [], below: [] };

  const mapped: MemberRow[] = rows.map((r) => {
    const close = Number(r.close);
    const maVal = Number(r.ma);
    return { symbol: r.symbol, close, ma: maVal, pctFromMa: ((close - maVal) / maVal) * 100 };
  });

  return {
    date: rows[0]!.trade_date,
    // strongest first above the line, weakest first below it
    above: mapped.filter((r) => r.pctFromMa > 0).sort((a, b) => b.pctFromMa - a.pctFromMa),
    below: mapped.filter((r) => r.pctFromMa <= 0).sort((a, b) => a.pctFromMa - b.pctFromMa),
  };
}
