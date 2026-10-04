/**
 * Writes breadth_daily (decision 0030): the whole liquid market on every day, and each
 * NSE index list (today's members) on the latest session. Averages through the same
 * adjustedAverages as the NIFTY 50. Never deletes a row. Whole-market rows are
 * upserted (recomputed from prices); index-list rows are only ever added: each run fills
 * the sessions since that list's last saved day within the nightly lookback (so a missed
 * night heals with today's members, a few days of hindsight), and a saved day is never
 * rewritten with later membership. A list's first run saves the latest session only.
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

  const lookback = Number(process.env.NIGHTLY_LOOKBACK_DAYS ?? 7);
  const recent = (await db.execute<{ d: string }>(dsql`
    select trade_date::text d from ingest_log where source = 'bhavcopy' and status = 'ok'
    and trade_date > ${asOf}::date - ${lookback}::int order by 1`)).map((r) => r.d);
  const saved = new Map((await db.execute<{ universe: string; d: string }>(dsql`
    select universe, max(trade_date)::text d from breadth_daily where universe <> 'market' group by 1`)).map((r) => [r.universe, r.d]));
  const targets = new Map<string, Set<string>>(LIST_UNIVERSES.map((x) => {
    const last = saved.get(x.key);
    return [x.key, new Set(last ? recent.filter((d) => d > last) : [asOf])] as const;
  }));

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
    for (const key of listsOf.get(symbol) ?? []) {
      const want = targets.get(key)!;
      if (want.size) addStock(listCounts.get(key)!, s, every, want);
    }
  }

  type Row = typeof schema.breadthDaily.$inferInsert;
  const rowsOf = (universe: string, c: Counts): Row[] =>
    [...c].flatMap(([tradeDate, day]) => MA_KINDS.filter((ma) => day[ma].total > 0).map((ma) => ({ universe, ma, tradeDate, ...day[ma] })));
  const marketRows = rowsOf("market", marketCounts);
  const listRows = [...listCounts].flatMap(([key, c]) => rowsOf(key, c));
  const target = [schema.breadthDaily.universe, schema.breadthDaily.ma, schema.breadthDaily.tradeDate];
  for (let i = 0; i < marketRows.length; i += 1000) {
    await db.insert(schema.breadthDaily).values(marketRows.slice(i, i + 1000))
      .onConflictDoUpdate({ target, set: { above: dsql`excluded.above`, total: dsql`excluded.total` } });
  }
  for (let i = 0; i < listRows.length; i += 1000) {
    await db.insert(schema.breadthDaily).values(listRows.slice(i, i + 1000)).onConflictDoNothing({ target });
  }
  return { asOf, marketDays: marketCounts.size, lists: [...listCounts.values()].filter((c) => c.size > 0).length };
}
