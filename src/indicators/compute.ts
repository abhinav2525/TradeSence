import { sql, type SQL } from "drizzle-orm";
import { db, schema } from "../db";
import { sma, ema } from "./moving-average";
import { adjustmentFactors, findUnexplainedJumps, type UnexplainedJump } from "./adjust";
import { symbolLineage, type LineageEntry } from "../ingest/symbol-changes";

/**
 * A gap longer than this means the series is discontinuous, not merely closed
 * for a holiday. NSE's longest normal break is a long weekend plus a holiday;
 * three weeks means data is genuinely missing.
 */
const MAX_GAP_DAYS = 21;

/**
 * Splits a date-ordered series wherever there is a hole.
 *
 * Moving averages count bars, not days, so without this a partially loaded
 * history would average 2018 closes together with 2024 closes and write the
 * result out as a perfectly ordinary non-null number.
 */
export function segmentByGaps(dates: string[], maxGapDays = MAX_GAP_DAYS): number[][] {
  const segments: number[][] = [];
  let current: number[] = [];

  for (let i = 0; i < dates.length; i++) {
    if (i > 0) {
      const prev = Date.parse(`${dates[i - 1]}T00:00:00Z`);
      const curr = Date.parse(`${dates[i]}T00:00:00Z`);
      if ((curr - prev) / 86_400_000 > maxGapDays) {
        segments.push(current);
        current = [];
      }
    }
    current.push(i);
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

const CHUNK = 1000;

/** `symbol = s` restricted to the dates that symbol belonged to this company. */
function inWindow(dateCol: SQL, e: LineageEntry): SQL {
  const parts = [sql`symbol = ${e.symbol}`];
  if (e.from) parts.push(sql`${dateCol} >= ${e.from}`);
  if (e.to) parts.push(sql`${dateCol} < ${e.to}`);
  return sql`(${sql.join(parts, sql` and `)})`;
}

/**
 * Recomputes moving averages for every index member and writes them to
 * `daily_indicators`.
 *
 * Runs per symbol, in date order, because the EMA recurrence depends on its own
 * previous value and cannot be expressed as a window function. Cheap enough to
 * recompute wholesale (50 symbols x ~2,500 days), so there is no incremental
 * path to get subtly wrong.
 *
 * Splits and bonuses: the averages are computed on closes adjusted by
 * `corporate_actions`, then scaled back by each day's own factor. So every
 * stored average is in the rupees that day actually traded at — the same units
 * as its `close` — and the breadth/crossings queries compare like with like
 * without knowing adjustment exists. `close` itself stays the raw bhavcopy price.
 * See docs/decisions/0002-split-adjusted-averages.md.
 *
 * Renames: a member's history includes every symbol it traded under before
 * (ZOMATO for ETERNAL), each only for the dates it belonged to this company,
 * all written under today's symbol. See docs/decisions/0003.
 */
export async function computeIndicators(
  indexName = "NIFTY50",
  opts: { onUnexplainedJump?: (j: UnexplainedJump & { symbol: string }) => void } = {},
): Promise<number> {
  const symbols = (
    await db.execute<{ symbol: string }>(
      sql`select distinct symbol from index_members where index_name = ${indexName}`,
    )
  ).map((r) => r.symbol);

  const renames = (
    await db.execute<{ old_symbol: string; new_symbol: string; changed_on: string }>(
      sql`select old_symbol, new_symbol, changed_on from symbol_changes`,
    )
  ).map((r) => ({ oldSymbol: r.old_symbol, newSymbol: r.new_symbol, changedOn: r.changed_on }));

  let written = 0;

  for (const symbol of symbols) {
    const lineage = symbolLineage(symbol, renames);

    const prices = await db.execute<{ trade_date: string; close: number }>(
      sql`select trade_date, close
          from daily_prices
          where series = 'EQ' and (${sql.join(lineage.map((e) => inWindow(sql`trade_date`, e)), sql` or `)})
          order by trade_date asc`,
    );
    if (prices.length === 0) continue;

    // NSE files past actions under the company's *current* symbol (UNOMINDA's
    // 2022 bonus, while it traded as MINDAIND), so today's symbol is not
    // date-bounded. Older symbols are, in case the ticker was reused. An action
    // listed under both counts once.
    const [current, ...older] = lineage;
    const eventRows = await db.execute<{ ex_date: string; subject: string; factor: number }>(
      sql`select distinct on (ex_date, subject) ex_date, subject, factor
          from corporate_actions
          where factor is not null and factor <> 1
            and (symbol = ${current!.symbol}
                 ${older.length ? sql`or ${sql.join(older.map((e) => inWindow(sql`ex_date`, e)), sql` or `)}` : sql``})`,
    );
    const events = [...eventRows];

    const dates = prices.map((p) => p.trade_date);
    const closes = prices.map((p) => Number(p.close));
    const factors = adjustmentFactors(
      dates,
      events.map((e) => ({ exDate: e.ex_date, factor: Number(e.factor) })),
    );
    const adjusted = closes.map((c, i) => c / factors[i]!);

    for (const jump of findUnexplainedJumps(dates, closes, factors)) {
      opts.onUnexplainedJump?.({ symbol, ...jump });
    }

    // Compute each contiguous stretch independently, so an average never spans
    // a hole in the history.
    const s50: (number | null)[] = new Array(closes.length).fill(null);
    const s200: (number | null)[] = new Array(closes.length).fill(null);
    const e200: (number | null)[] = new Array(closes.length).fill(null);

    for (const seg of segmentByGaps(dates)) {
      const segCloses = seg.map((i) => adjusted[i]!);
      const a = sma(segCloses, 50);
      const b = sma(segCloses, 200);
      const c = ema(segCloses, 200);
      // Back into that day's own rupees, so it compares directly with `close`.
      const unadjust = (v: number | null, f: number) => (v === null ? null : v * f);
      seg.forEach((rowIndex, j) => {
        const f = factors[rowIndex]!;
        s50[rowIndex] = unadjust(a[j]!, f);
        s200[rowIndex] = unadjust(b[j]!, f);
        e200[rowIndex] = unadjust(c[j]!, f);
      });
    }

    const rows = prices.map((p, i) => ({
      tradeDate: p.trade_date,
      symbol,
      close: closes[i]!,
      sma50: s50[i],
      sma200: s200[i],
      ema200: e200[i],
    }));

    for (let i = 0; i < rows.length; i += CHUNK) {
      await db
        .insert(schema.dailyIndicators)
        .values(rows.slice(i, i + CHUNK))
        .onConflictDoUpdate({
          target: [schema.dailyIndicators.tradeDate, schema.dailyIndicators.symbol],
          set: {
            close: sql`excluded.close`,
            sma50: sql`excluded.sma_50`,
            sma200: sql`excluded.sma_200`,
            ema200: sql`excluded.ema_200`,
          },
        });
    }
    written += rows.length;
  }

  return written;
}
