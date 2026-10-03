/** Database reads for research 0002. Membership is joined per trade date, as everywhere. */
import { sql } from "drizzle-orm";
import { db } from "../db";

const INDEX = "Nifty 50"; // NSE's name in index_prices

export type MarketDay = { date: string; up: number; down: number };

/** Per session: ₹ turnover of that day's members that rose, and that fell. */
export async function marketTurnover(indexName = "NIFTY50"): Promise<MarketDay[]> {
  const rows = await db.execute<{ date: string; up: number; down: number }>(sql`
    select i.trade_date::text as date,
           coalesce(sum(i.turnover) filter (where i.change_pct > 0), 0) as up,
           coalesce(sum(i.turnover) filter (where i.change_pct < 0), 0) as down
    from daily_indicators i
    join index_members m
      on m.symbol = i.symbol
     and m.index_name = ${indexName}
     and i.trade_date >= m.added_on
     and (m.removed_on is null or i.trade_date < m.removed_on)
    where i.change_pct is not null
    group by i.trade_date
    order by i.trade_date asc
  `);
  return rows.map((r) => ({ date: r.date, up: Number(r.up), down: Number(r.down) }));
}

export async function niftyCloses(): Promise<Map<string, number>> {
  const rows = await db.execute<{ d: string; close: number }>(
    sql`select trade_date::text d, close from index_prices where index_name = ${INDEX}`,
  );
  return new Map(rows.map((r) => [r.d, Number(r.close)]));
}

export async function memberWindows(indexName = "NIFTY50"): Promise<Map<string, { addedOn: string; removedOn: string | null }[]>> {
  const rows = await db.execute<{ symbol: string; added_on: string; removed_on: string | null }>(
    sql`select symbol, added_on::text, removed_on::text from index_members where index_name = ${indexName}`,
  );
  const out = new Map<string, { addedOn: string; removedOn: string | null }[]>();
  for (const r of rows) {
    const list = out.get(r.symbol) ?? [];
    list.push({ addedOn: r.added_on, removedOn: r.removed_on });
    out.set(r.symbol, list);
  }
  return out;
}

/** The stored 200-day SMA (in each day's rupees), volume ratio and raw close, by date. */
export async function stockIndicators(symbol: string): Promise<Map<string, { sma200: number | null; volRatio: number | null; close: number }>> {
  const rows = await db.execute<{ d: string; sma_200: number | null; vol_ratio: number | null; close: number }>(
    sql`select trade_date::text d, sma_200, vol_ratio, close from daily_indicators where symbol = ${symbol}`,
  );
  return new Map(rows.map((r) => [r.d, {
    sma200: r.sma_200 === null ? null : Number(r.sma_200),
    volRatio: r.vol_ratio === null ? null : Number(r.vol_ratio),
    close: Number(r.close),
  }]));
}
