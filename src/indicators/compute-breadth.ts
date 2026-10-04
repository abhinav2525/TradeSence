/**
 * Writes breadth_daily (decision 0030): the whole liquid market on every day, and each
 * NSE index list (today's members) on the latest session. Averages through the same
 * adjustedAverages as the NIFTY 50. Upserts only: this never deletes a row, so the
 * index lists' history builds up night by night and old nights are kept.
 */
import { sql as dsql } from "drizzle-orm";
import { db, schema } from "../db";
import { loadAdjustedHistory, loadRenames } from "./history";
import { adjustedAverages } from "./averages";
import { segmentByGaps } from "./gaps";
import { liquidFlags } from "./activity";
import { allFundSymbols, companies } from "./universe";
import { LIST_UNIVERSES, MA_KINDS, addStock, newCounts, type Counts } from "./breadth-universes";

export async function computeBreadth(): Promise<{ asOf: string | null; marketDays: number; lists: number }> {
  const [last] = await db.execute<{ d: string | null }>(dsql`
    select max(trade_date)::text d from ingest_log where source = 'bhavcopy' and status = 'ok'`);
  const asOf = last?.d ?? null;
  if (!asOf) return { asOf: null, marketDays: 0, lists: 0 };

  const market = new Set(await companies(await allFundSymbols()));
  const members = await db.execute<{ index_key: string; symbol: string }>(dsql`
    select index_key, symbol from index_constituents where index_key in (${dsql.join(LIST_UNIVERSES.map((x) => dsql`${x.key}`), dsql`, `)})`);
  const listsOf = new Map<string, string[]>();
  for (const m of members) (listsOf.get(m.symbol) ?? listsOf.set(m.symbol, []).get(m.symbol)!).push(m.index_key);

  const marketCounts = newCounts();
  const listCounts = new Map<string, Counts>(LIST_UNIVERSES.map((x) => [x.key, newCounts()]));
  const renames = await loadRenames();
  for (const symbol of new Set([...market, ...listsOf.keys()])) {
    const h = await loadAdjustedHistory(symbol, renames);
    if (!h) continue;
    const s = { dates: h.dates, ...adjustedAverages(h) };
    if (market.has(symbol)) addStock(marketCounts, s, liquidFlags(h.turnover, segmentByGaps(h.dates)));
    const every = h.dates.map(() => true);
    for (const key of listsOf.get(symbol) ?? []) addStock(listCounts.get(key)!, s, every, asOf);
  }

  const rows: (typeof schema.breadthDaily.$inferInsert)[] = [];
  const push = (universe: string, c: Counts) => {
    for (const [tradeDate, day] of c) for (const ma of MA_KINDS) if (day[ma].total > 0) rows.push({ universe, ma, tradeDate, ...day[ma] });
  };
  push("market", marketCounts);
  for (const [key, c] of listCounts) push(key, c);
  for (let i = 0; i < rows.length; i += 1000) {
    await db.insert(schema.breadthDaily).values(rows.slice(i, i + 1000)).onConflictDoUpdate({
      target: [schema.breadthDaily.universe, schema.breadthDaily.ma, schema.breadthDaily.tradeDate],
      set: { above: dsql`excluded.above`, total: dsql`excluded.total` },
    });
  }
  return { asOf, marketDays: marketCounts.size, lists: [...listCounts.values()].filter((c) => c.size > 0).length };
}
