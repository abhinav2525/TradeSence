/**
 * The Signals page's data (decision 0017): 200-day SMA breadth from the same
 * query as the home page and research 0001, joined to the NIFTY 50's close.
 * Only sessions with both count, as in the study.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { breadthSeries } from "./breadth";
import { buildSignals, type Day, type Signals } from "../indicators/signals";

const INDEX = "Nifty 50"; // NSE's name in index_prices

export async function signalsData(): Promise<Signals> {
  const [breadth, rows] = await Promise.all([
    breadthSeries("sma200"),
    db.execute<{ d: string; close: number }>(
      sql`select trade_date::text d, close from index_prices where index_name = ${INDEX}`,
    ),
  ]);
  const closes = new Map(rows.map((r) => [r.d, Number(r.close)]));
  const days: Day[] = breadth
    .filter((b) => closes.has(b.date))
    .map((b) => ({ date: b.date, pct: b.pctAbove, close: closes.get(b.date)! }));
  return buildSignals(days);
}
