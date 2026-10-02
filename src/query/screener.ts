/**
 * The Screener: which members crossed their average on a session, whether
 * volume backed the move, and which are about to cross. Spec:
 * docs/design/HANDOFF.md §2; decisions: docs/decisions/0009-screener.md.
 *
 * All three averages are selected and the chosen one picked in TypeScript, so
 * no column name is ever interpolated into SQL (CLAUDE.md, sql.raw).
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { MAX_GAP_DAYS } from "../indicators/gaps";
import { crossingStats } from "./crossings";
import type { MaKind } from "./breadth";

/** Within this % of the average, a stock is "near the line". */
export const NEAR_PCT = 1;

export type SessionRow = {
  date: string;
  close: number;
  ma: number | null;
  changePct: number | null;
  volRatio: number | null;
};

export type SymbolReading = {
  close: number;
  ma: number | null;
  pctFromMa: number | null;
  changePct: number | null;
  volRatio: number | null;
  cross: "above" | "below" | null;
  /** Sessions on the other side before this cross; null when there was no cross. */
  runBefore: number | null;
  /** pctFromMa five sessions earlier, to show whether a near-line stock is closing in. */
  gap5: number | null;
};

const dayGap = (a: string, b: string) =>
  (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;
const pct = (r: SessionRow) => (r.ma === null ? null : (r.close / r.ma - 1) * 100);
const isAbove = (r: SessionRow) => r.ma !== null && r.close > r.ma;
/** Two sessions that can be compared: both have an average and no hole between them. */
const linked = (a: SessionRow, b: SessionRow) =>
  a.ma !== null && b.ma !== null && dayGap(a.date, b.date) <= MAX_GAP_DAYS;

/**
 * Reads one stock's chronological sessions, ending on the session being
 * screened. A cross needs yesterday and today to be linked: the session where
 * the average first appears, or the far side of a hole, never counts (the same
 * rule as crossingStats).
 */
export function readSymbol(rows: SessionRow[]): SymbolReading | null {
  const cur = rows.at(-1);
  if (!cur) return null;
  const prev = rows.at(-2);

  let cross: SymbolReading["cross"] = null;
  if (prev && linked(prev, cur) && isAbove(prev) !== isAbove(cur)) cross = isAbove(cur) ? "above" : "below";

  let runBefore: number | null = null;
  if (cross) {
    runBefore = 0;
    for (let i = rows.length - 2; i >= 0; i--) {
      const r = rows[i]!;
      if (r.ma === null || isAbove(r) === isAbove(cur)) break;
      if (i < rows.length - 2 && !linked(r, rows[i + 1]!)) break;
      runBefore++;
    }
  }

  let gap5: number | null = null;
  const back = rows.at(-6);
  if (back) {
    const window = rows.slice(-6);
    if (window.every((r, i) => i === 0 || linked(window[i - 1]!, r))) gap5 = pct(back);
  }

  return {
    close: cur.close, ma: cur.ma, pctFromMa: pct(cur),
    changePct: cur.changePct, volRatio: cur.volRatio, cross, runBefore, gap5,
  };
}

export const isNear = (pctFromMa: number) => Math.abs(pctFromMa) <= NEAR_PCT;

/**
 * Whether a volume ratio meets a threshold, judged on the value the reader sees
 * (one decimal), so a row showing "2.0×" always passes "≥2×". A threshold of 0
 * ("Any") keeps stocks with no ratio yet.
 */
export function volumeAtLeast(ratio: number | null, min: number): boolean {
  if (min === 0) return true;
  return ratio !== null && Math.round(ratio * 10) / 10 >= min;
}

/** Linear-interpolated percentile of a list (p in 0–100). */
export function percentile(values: number[], p: number): number {
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 0) return 0;
  const pos = ((s.length - 1) * p) / 100;
  const lo = Math.floor(pos);
  return s[lo]! + (s[Math.ceil(pos)]! - s[lo]!) * (pos - lo);
}

export type CrosserBadge = "Calm crosser" | "Typical" | "Busy";

/** Relative to today's members: how whipsaw-prone is this name? */
export function crosserBadge(count: number, p25: number, p75: number): CrosserBadge {
  if (count <= p25) return "Calm crosser";
  if (count >= p75) return "Busy";
  return "Typical";
}

export type ScreenerRow = SymbolReading & {
  symbol: string;
  pastCrossings: number | null;
  badge: CrosserBadge | null;
};

/**
 * Every member on `date`, read against the chosen average. The caller picks a
 * real session first (resolveSession), exactly as the Breadth page does.
 */
export async function screenerOn(
  ma: MaKind,
  date: string,
  indexName = "NIFTY50",
): Promise<{ date: string; rows: ScreenerRow[] }> {
  const history = await db.execute<{
    symbol: string; trade_date: string; close: number;
    sma_50: number | null; sma_200: number | null; ema_200: number | null;
    change_pct: number | null; vol_ratio: number | null;
  }>(sql`
    select i.symbol, i.trade_date::text, i.close, i.sma_50, i.sma_200, i.ema_200, i.change_pct, i.vol_ratio
    from daily_indicators i
    where i.trade_date <= ${date}
      and i.symbol in (
        select m.symbol from index_members m
        where m.index_name = ${indexName}
          and ${date} >= m.added_on and (m.removed_on is null or ${date} < m.removed_on))
    order by i.symbol, i.trade_date
  `);

  const pick = (r: (typeof history)[number]) =>
    ma === "sma50" ? r.sma_50 : ma === "sma200" ? r.sma_200 : r.ema_200;

  const bySymbol = new Map<string, SessionRow[]>();
  for (const r of history) {
    const list = bySymbol.get(r.symbol) ?? [];
    const m = pick(r);
    list.push({
      date: r.trade_date, close: Number(r.close), ma: m === null ? null : Number(m),
      changePct: r.change_pct === null ? null : Number(r.change_pct),
      volRatio: r.vol_ratio === null ? null : Number(r.vol_ratio),
    });
    bySymbol.set(r.symbol, list);
  }

  const counts = new Map((await crossingStats(ma, indexName)).map((c) => [c.symbol, c.crossings]));
  const known = [...bySymbol.keys()].map((s) => counts.get(s)).filter((c): c is number => c !== undefined);
  const p25 = percentile(known, 25);
  const p75 = percentile(known, 75);

  const rows: ScreenerRow[] = [];
  for (const [symbol, series] of bySymbol) {
    if (series.at(-1)?.date !== date) continue; // didn't trade that session
    const reading = readSymbol(series)!;
    const past = counts.get(symbol) ?? null;
    rows.push({ symbol, ...reading, pastCrossings: past, badge: past === null ? null : crosserBadge(past, p25, p75) });
  }
  return { date, rows };
}
