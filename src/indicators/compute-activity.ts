/**
 * Rebuilds `unusual_days` for every company (Unusual activity page). Full
 * recompute in one transaction: a reader sees the old set or the new one,
 * never an empty table, and a late corporate action re-adjusts history.
 */
import { db, schema } from "../db";
import { loadAdjustedHistory, loadRenames } from "./history";
import { unusualDays } from "./activity";
import { companies, readFundSymbols } from "./universe";

const CHUNK = 1000; // 13 columns × 1000 rows, under Postgres' 65535 bind parameters

export async function computeUnusualDays(opts: { symbols?: string[] } = {}): Promise<{ rows: number; companies: number }> {
  const renames = await loadRenames();
  const symbols = opts.symbols ?? (await companies(readFundSymbols()));
  const rows: (typeof schema.unusualDays.$inferInsert)[] = [];
  let used = 0;
  for (const symbol of symbols) {
    const h = await loadAdjustedHistory(symbol, renames);
    if (!h || !h.delivered.some((x) => x != null)) continue;
    used++;
    for (const r of unusualDays(h)) rows.push({ symbol, ...r });
  }
  await db.transaction(async (tx) => {
    await tx.delete(schema.unusualDays);
    for (let i = 0; i < rows.length; i += CHUNK) await tx.insert(schema.unusualDays).values(rows.slice(i, i + CHUNK));
  });
  return { rows: rows.length, companies: used };
}
