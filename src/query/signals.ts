/**
 * The Signals page's data (decision 0017): 200-day SMA breadth from the same
 * query as the home page and research 0001, joined to the index's own close.
 * Only sessions with both count, as in the study. Any registered index runs the
 * same rules on its own members and close (decision 0035); only the NIFTY 50's
 * were tested.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { breadthSeries } from "./breadth";
import { buildSignals, type Day, type Signals } from "../indicators/signals";
import { NIFTY50, type IndexEntry } from "../ingest/indices";

export async function signalsData(ix: IndexEntry = NIFTY50): Promise<Signals> {
  const [breadth, rows] = await Promise.all([
    breadthSeries("sma200", ix.members),
    db.execute<{ d: string; close: number }>(
      sql`select trade_date::text d, close from index_prices where index_name = ${ix.prices}`,
    ),
  ]);
  const closes = new Map(rows.map((r) => [r.d, Number(r.close)]));
  const days: Day[] = breadth
    .filter((b) => closes.has(b.date))
    .map((b) => ({ date: b.date, pct: b.pctAbove, close: closes.get(b.date)!, above: b.above, total: b.total }));
  return buildSignals(days);
}
