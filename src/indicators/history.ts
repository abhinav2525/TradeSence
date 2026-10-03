/**
 * One company's full price history, joined across renames and with its
 * split/bonus/demerger factors: the loader computeIndicators and the research
 * scripts share, so they can never adjust differently (decisions 0002–0004).
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { adjustmentFactors, demergerFactor } from "./adjust";
import { symbolLineage, type LineageEntry } from "../ingest/symbol-changes";

export type Rename = { oldSymbol: string; newSymbol: string; changedOn: string };

export type History = {
  dates: string[];
  open: number[];
  high: number[];
  low: number[];
  close: number[]; // raw bhavcopy prices
  volume: number[]; // raw shares
  turnover: number[];
  factors: number[]; // divide a raw price by this for the adjusted series
  shareFactors: number[]; // multiply raw volume by this (splits/bonuses only, never demergers)
};

/** `symbol = s` restricted to the dates that symbol belonged to this company. */
function inWindow(dateCol: SQL, e: LineageEntry): SQL {
  const parts = [sql`symbol = ${e.symbol}`];
  if (e.from) parts.push(sql`${dateCol} >= ${e.from}`);
  if (e.to) parts.push(sql`${dateCol} < ${e.to}`);
  return sql`(${sql.join(parts, sql` and `)})`;
}

export async function loadRenames(): Promise<Rename[]> {
  return (
    await db.execute<{ old_symbol: string; new_symbol: string; changed_on: string }>(
      sql`select old_symbol, new_symbol, changed_on from symbol_changes`,
    )
  ).map((r) => ({ oldSymbol: r.old_symbol, newSymbol: r.new_symbol, changedOn: r.changed_on }));
}

export async function loadAdjustedHistory(symbol: string, renames: Rename[]): Promise<History | null> {
  const lineage = symbolLineage(symbol, renames);
  const prices = await db.execute<{
    trade_date: string; open: number; high: number; low: number; close: number; volume: number; turnover: number;
  }>(
    sql`select trade_date, open, high, low, close, volume, turnover
        from daily_prices
        where series = 'EQ' and (${sql.join(lineage.map((e) => inWindow(sql`trade_date`, e)), sql` or `)})
        order by trade_date asc`,
  );
  if (prices.length === 0) return null;

  // NSE files past actions under the company's *current* symbol (UNOMINDA's
  // 2022 bonus, while it traded as MINDAIND), so today's symbol is not
  // date-bounded. Older symbols are, in case the ticker was reused. An action
  // listed under both counts once.
  const [current, ...older] = lineage;
  const eventRows = await db.execute<{ ex_date: string; subject: string; kind: string; factor: number }>(
    sql`select distinct on (ex_date, subject) ex_date, subject, kind, factor
        from corporate_actions
        where ((factor is not null and factor <> 1) or kind = 'demerger')
          and (symbol = ${current!.symbol}
               ${older.length ? sql`or ${sql.join(older.map((e) => inWindow(sql`ex_date`, e)), sql` or `)}` : sql``})`,
  );

  const dates = prices.map((p) => p.trade_date);
  const open = prices.map((p) => Number(p.open));
  const close = prices.map((p) => Number(p.close));

  // Splits and bonuses carry their factor; a demerger's comes from prices.
  // One that cannot be priced is left out, and the jump check reports it.
  const events = eventRows.flatMap((e) => {
    const factor = e.kind === "demerger" ? demergerFactor(dates, open, close, e.ex_date) : Number(e.factor);
    return factor === null ? [] : [{ exDate: e.ex_date, factor, demerger: e.kind === "demerger" }];
  });

  return {
    dates,
    open,
    high: prices.map((p) => Number(p.high)),
    low: prices.map((p) => Number(p.low)),
    close,
    volume: prices.map((p) => Number(p.volume)),
    turnover: prices.map((p) => Number(p.turnover)),
    factors: adjustmentFactors(dates, events),
    // Volume is scaled by share-count changes only: a demerger moves the price
    // but leaves the number of shares alone (decision 0008).
    shareFactors: adjustmentFactors(dates, events.filter((e) => !e.demerger)),
  };
}
