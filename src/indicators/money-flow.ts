/**
 * Money flow page: each sector's ₹ traded against its own normal (spec
 * docs/superpowers/specs/2026-10-05-money-flow-design.md). Pure: computeMoneyFlow
 * stores flowStats per stock nightly; the page aggregates with sectorFlows.
 */
import type { History } from "./history";
import { median } from "./signals";
import { NOISE_PCT } from "./risk";
import { windowMove } from "./volume-leaders";

export const FLOW_PERIODS = [1, 5, 21] as const;
export type FlowPeriod = (typeof FLOW_PERIODS)[number];
export const NORMAL_SESSIONS = 63; // about 3 months before the window: never the days being judged
export const MIN_NORMAL = 40; // traded sessions of those 63 for a stock to have a normal
export const MIN_SECTOR_STOCKS = 5; // one stock is not a sector

/** The page's `period` param: exactly "1", "5" or "21"; anything else is 1 week. */
export function cleanFlowPeriod(v: string | undefined): FlowPeriod {
  return v === "1" ? 1 : v === "21" ? 21 : 5;
}

/** The page's `sector` param: exactly one of the sectors we hold, else none. */
export function cleanSector(v: string | undefined, held: readonly string[]): string | null {
  return v !== undefined && held.includes(v) ? v : null;
}

export const SHORT_SESSION_X = 0.5; // market-wide ₹ under half a usual day: a short special session
const SHORT_LOOKBACK = 63, SHORT_MIN_HISTORY = 20;

/**
 * Sessions where the whole market traded under half its usual day (median of up to
 * the 63 sessions before): Diwali Muhurat evenings and special Saturday sessions
 * trade 9–20% of normal, so every sector looks quiet. `totals` oldest first.
 */
export function shortSessions(totals: { date: string; turnover: number }[]): string[] {
  return shortSessionRows(totals).map((r) => r.date);
}

/** shortSessions with the day's market-wide ₹ and its usual, for the short_sessions table. */
export function shortSessionRows(totals: { date: string; turnover: number }[]): { date: string; turnover: number; usual: number }[] {
  return totals.flatMap((t, i) => {
    if (i < SHORT_MIN_HISTORY) return [];
    const usual = median(totals.slice(Math.max(0, i - SHORT_LOOKBACK), i).map((x) => x.turnover));
    return usual !== null && usual > 0 && t.turnover < SHORT_SESSION_X * usual ? [{ date: t.date, turnover: t.turnover, usual }] : [];
  });
}

export type FlowWindows = {
  asOf: string;
  starts: Record<FlowPeriod, string>;
  normalFrom: Record<FlowPeriod, string>;
  normalTo: Record<FlowPeriod, string>;
};

/** Windows from market sessions, newest first; null without the longest window plus its normal. */
export function flowWindows(days: string[]): FlowWindows | null {
  const longest = FLOW_PERIODS.at(-1)!;
  if (days.length < longest + NORMAL_SESSIONS) return null;
  const by = (f: (p: FlowPeriod) => string) => Object.fromEntries(FLOW_PERIODS.map((p) => [p, f(p)])) as Record<FlowPeriod, string>;
  return {
    asOf: days[0]!,
    starts: by((p) => days[p - 1]!),
    normalTo: by((p) => days[p]!),
    normalFrom: by((p) => days[p + NORMAL_SESSIONS - 1]!),
  };
}

export type FlowStat = { period: FlowPeriod; turnover: number; normalDaily: number | null; sessions: number; changePct: number | null };

/** Indices of `dates` (ascending) within [from, to], by binary search. */
function span(dates: string[], from: string, to: string): [number, number] {
  const lower = (x: string) => { let lo = 0, hi = dates.length; while (lo < hi) { const m = (lo + hi) >> 1; if (dates[m]! < x) lo = m + 1; else hi = m; } return lo; };
  return [lower(from), lower(to + "\uffff")]; // [first, end)
}

/** The shared core of a window's stats: one rule for the bars and the weekly history. */
function windowStat(h: History, period: FlowPeriod, start: string, end: string, normalFrom: string, normalTo: string): FlowStat | null {
  const [a, b] = span(h.dates, start, end);
  const [c, d] = span(h.dates, normalFrom, normalTo);
  let normalSum = 0;
  for (let i = c; i < d; i++) normalSum += h.turnover[i]!;
  const normalDaily = d - c >= MIN_NORMAL ? normalSum / (d - c) : null;
  if (b === a && normalDaily === null) return null;
  let turnover = 0;
  for (let i = a; i < b; i++) turnover += h.turnover[i]!;
  return { period, turnover, normalDaily, sessions: b - a, changePct: b > a ? windowMove(h, a, b - 1, end) : null };
}

/**
 * One stock's ₹ traded per window and its normal per session. No row for a window
 * it neither traded in nor has a normal for (nothing to say about it).
 */
export function flowStats(h: History, w: FlowWindows): FlowStat[] {
  return FLOW_PERIODS.flatMap((p) => {
    const s = windowStat(h, p, w.starts[p], w.asOf, w.normalFrom[p], w.normalTo[p]);
    return s ? [s] : [];
  });
}

export type FlowRow = { symbol: string; sector: string; turnover: number; normalDaily: number | null; changePct: number | null };
export type SectorFlow = {
  sector: string;
  stocks: number;
  ratio: number | null; // ₹ traded ÷ normal ₹ for the window, over stocks with a normal
  share: number; // of all ₹ traded in the window
  usualShare: number | null; // of all normal ₹ per session
  medianMove: number | null;
  up: number;
  down: number;
};

/** Per sector, busiest against its normal first; sectors under MIN_SECTOR_STOCKS are named in `small`. */
export function sectorFlows(rows: FlowRow[], period: FlowPeriod): { sectors: SectorFlow[]; small: string[] } {
  const total = rows.reduce((s, r) => s + r.turnover, 0);
  const totalNormal = rows.reduce((s, r) => s + (r.normalDaily ?? 0), 0);
  const bySector = new Map<string, FlowRow[]>();
  for (const r of rows) (bySector.get(r.sector) ?? bySector.set(r.sector, []).get(r.sector)!).push(r);
  const sectors: SectorFlow[] = [];
  const small: string[] = [];
  for (const [sector, rs] of bySector) {
    if (rs.length < MIN_SECTOR_STOCKS) { small.push(sector); continue; }
    // The spec's ratio: stocks with a normal that traded in the window (a suspended
    // stock would otherwise pull its sector down by its whole normal).
    const withNormal = rs.filter((r) => r.normalDaily !== null && r.turnover > 0);
    const expected = withNormal.reduce((s, r) => s + r.normalDaily! * period, 0);
    const moves = rs.map((r) => r.changePct).filter((v): v is number => v !== null);
    const normalSum = rs.reduce((s, r) => s + (r.normalDaily ?? 0), 0);
    sectors.push({
      sector, stocks: rs.length,
      ratio: expected > 0 ? withNormal.reduce((s, r) => s + r.turnover, 0) / expected : null,
      share: total > 0 ? rs.reduce((s, r) => s + r.turnover, 0) / total : 0,
      usualShare: totalNormal > 0 ? normalSum / totalNormal : null,
      medianMove: median(moves),
      up: moves.filter((m) => m > NOISE_PCT).length,
      down: moves.filter((m) => m < -NOISE_PCT).length,
    });
  }
  sectors.sort((a, b) => (b.ratio ?? -Infinity) - (a.ratio ?? -Infinity) || a.sector.localeCompare(b.sector));
  return { sectors, small: small.sort() };
}

/** A sector's stocks by money above their own normal (extra ₹); stocks without a normal last. */
export function sectorStocks(rows: FlowRow[], sector: string, period: FlowPeriod, limit = 25) {
  return rows
    .filter((r) => r.sector === sector)
    .map((r) => {
      const expected = r.normalDaily === null ? null : r.normalDaily * period;
      return { ...r, extra: expected === null ? null : r.turnover - expected, ratio: expected ? r.turnover / expected : null };
    })
    .sort((a, b) => (b.extra ?? -Infinity) - (a.extra ?? -Infinity) || b.turnover - a.turnover || a.symbol.localeCompare(b.symbol))
    .slice(0, limit);
}

// ── History: the 1-week reading for each of the last 52 weeks (spec 2026-10-05 history) ──

export const HISTORY_WEEKS = 52;
export type WeekWindow = { end: string; start: string; normalFrom: string; normalTo: string };

/** Week k = sessions 5k … 5k+4 (newest first), its normal the 63 after; only weeks with a full normal. Week 0 ≡ flowWindows' 1 week. */
export function weekWindows(days: string[], weeks = HISTORY_WEEKS): WeekWindow[] {
  const out: WeekWindow[] = [];
  for (let k = 0; k < weeks; k++) {
    const e = 5 * k;
    if (e + 5 + NORMAL_SESSIONS > days.length) break;
    out.push({ end: days[e]!, start: days[e + 4]!, normalTo: days[e + 5]!, normalFrom: days[e + 4 + NORMAL_SESSIONS]! });
  }
  return out;
}

export type SectorWeek = { weekEnd: string; sector: string; ratio: number | null; medianMove: number | null; stocks: number; shortSession: boolean };

/** Each sector's 1-week reading per week, through sectorFlows (sectors under 5 stocks with data that week are left out). */
export function weeklySectorFlows(stocks: { symbol: string; sector: string; h: History }[], weeks: WeekWindow[], short: Set<string>): SectorWeek[] {
  const shorts = [...short];
  return weeks.flatMap((wk) => {
    const rows: FlowRow[] = stocks.flatMap(({ symbol, sector, h }) => {
      const s = windowStat(h, 5, wk.start, wk.end, wk.normalFrom, wk.normalTo);
      return s ? [{ symbol, sector, turnover: s.turnover, normalDaily: s.normalDaily, changePct: s.changePct }] : [];
    });
    const shortSession = shorts.some((d) => d >= wk.start && d <= wk.end);
    return sectorFlows(rows, 5).sectors.map((x) => ({ weekEnd: wk.end, sector: x.sector, ratio: x.ratio, medianMove: x.medianMove, stocks: x.stocks, shortSession }));
  });
}

/** Market-wide ₹ per session across these histories, oldest first, from a date: input to shortSessions. */
export function marketTotals(histories: History[], from: string): { date: string; turnover: number }[] {
  const by = new Map<string, number>();
  for (const h of histories) h.dates.forEach((d, i) => { if (d >= from) by.set(d, (by.get(d) ?? 0) + h.turnover[i]!); });
  return [...by.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, turnover]) => ({ date, turnover }));
}
