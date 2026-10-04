/**
 * Rebuilds `volume_leaders` for every Nifty Total Market stock: totals over the
 * last 1/5/21/63/126 market sessions, through loadAdjustedHistory (renames,
 * splits). Replaced in one transaction, like unusual_days.
 */
import { eq, sql as dsql } from "drizzle-orm";
import { db, schema } from "../db";
import { loadAdjustedHistory, loadRenames } from "./history";
import { PERIODS, leaderStats, type Period } from "./volume-leaders";

export async function computeVolumeLeaders(opts: { symbols?: string[] } = {}): Promise<{ rows: number; asOf: string | null }> {
  const days = (await db.execute<{ d: string }>(dsql`
    select trade_date::text d from ingest_log where source = 'bhavcopy' and status = 'ok'
    order by trade_date desc limit 126`)).map((r) => r.d);
  if (days.length === 0) return { rows: 0, asOf: null };
  const asOf = days[0]!;
  const starts = Object.fromEntries(PERIODS.map((p) => [p, days[Math.min(p, days.length) - 1]!])) as Record<Period, string>;
  const symbols = opts.symbols ?? (await db.select({ s: schema.indexConstituents.symbol }).from(schema.indexConstituents)
    .where(eq(schema.indexConstituents.indexKey, "total-market"))).map((r) => r.s);
  const unusual = await db.execute<{ symbol: string; d: string }>(dsql`
    select symbol, trade_date::text d from unusual_days where trade_date >= ${starts[126]}`);
  const unusualBy = new Map<string, string[]>();
  for (const u of unusual) (unusualBy.get(u.symbol) ?? unusualBy.set(u.symbol, []).get(u.symbol)!).push(u.d);

  const renames = await loadRenames();
  const rows: (typeof schema.volumeLeaders.$inferInsert)[] = [];
  for (const symbol of symbols) {
    const h = await loadAdjustedHistory(symbol, renames);
    if (!h) continue;
    const u = unusualBy.get(symbol) ?? [];
    for (const s of leaderStats(h, starts, asOf)) {
      rows.push({ asOf, symbol, ...s, unusualDays: u.filter((d) => d >= starts[s.period] && d <= asOf).length });
    }
  }
  await db.transaction(async (tx) => {
    await tx.delete(schema.volumeLeaders);
    for (let i = 0; i < rows.length; i += 1000) await tx.insert(schema.volumeLeaders).values(rows.slice(i, i + 1000));
  });
  return { rows: rows.length, asOf };
}
