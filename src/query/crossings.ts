import { sql } from "drizzle-orm";
import { db } from "../db";
import { MA_COLUMNS, type MaKind } from "./breadth";
import { MAX_GAP_DAYS } from "../indicators/gaps";

export type CrossingStat = {
  symbol: string;
  crossings: number;
  sessions: number;
  avgDaysPerRun: number | null;
  currentState: "above" | "below";
  daysInCurrentRun: number;
  lastCrossing: string | null;
};

function column(ma: MaKind) {
  const col = MA_COLUMNS[ma];
  if (!col) throw new Error(`Unknown moving average: ${ma}`);
  return sql.raw(col);
}

/**
 * How often each index member has crossed its moving average.
 *
 * This measures *whipsaw*, not strength: a stock can spend most of its time
 * above the line and still cross it constantly, which is precisely when the
 * signal is least worth acting on.
 *
 * Two things could fake a crossing and both are excluded — the session where
 * the averaging window first fills (a null-to-value step, filtered out by the
 * `is not null` clause), and the two sessions either side of a hole in the
 * history (filtered by MAX_GAP_DAYS).
 */
export async function crossingStats(
  ma: MaKind,
  indexName = "NIFTY50",
): Promise<CrossingStat[]> {
  const col = column(ma);

  const rows = await db.execute<{
    symbol: string;
    crossings: number;
    sessions: number;
    current_above: boolean;
    days_in_run: number;
    last_crossing: string | null;
  }>(sql`
    with base as (
      select i.symbol, i.trade_date, (i.close > i.${col}) as above
      from daily_indicators i
      join index_members m
        on m.symbol = i.symbol
       and m.index_name = ${indexName}
       and i.trade_date >= m.added_on
       and (m.removed_on is null or i.trade_date < m.removed_on)
      where i.${col} is not null
    ),
    seq as (
      select symbol, trade_date, above,
             lag(above)      over w as prev_above,
             lag(trade_date) over w as prev_date
      from base
      window w as (partition by symbol order by trade_date)
    ),
    marked as (
      select symbol, trade_date, above,
             case
               when prev_above is null then false
               when trade_date - prev_date > ${MAX_GAP_DAYS} then false
               else above is distinct from prev_above
             end as is_cross
      from seq
    ),
    agg as (
      select symbol,
             count(*)::int                                          as sessions,
             count(*) filter (where is_cross)::int                   as crossings,
             max(trade_date) filter (where is_cross)                 as last_crossing,
             (array_agg(above order by trade_date desc))[1]          as current_above
      from marked group by symbol
    )
    select a.symbol, a.crossings, a.sessions, a.current_above,
           a.last_crossing::text as last_crossing,
           (select count(*)::int from marked k
             where k.symbol = a.symbol
               and (a.last_crossing is null or k.trade_date >= a.last_crossing)) as days_in_run
    from agg a
    order by a.crossings desc, a.symbol asc
  `);

  return rows.map((r) => {
    const crossings = Number(r.crossings);
    const sessions = Number(r.sessions);
    return {
      symbol: r.symbol,
      crossings,
      sessions,
      // a run is the stretch between crossings; N crossings cut the series into N+1
      avgDaysPerRun: sessions === 0 ? null : sessions / (crossings + 1),
      currentState: r.current_above ? "above" : "below",
      daysInCurrentRun: Number(r.days_in_run),
      lastCrossing: r.last_crossing,
    };
  });
}
