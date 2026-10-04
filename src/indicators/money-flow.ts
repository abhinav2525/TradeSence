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
  return totals.flatMap((t, i) => {
    if (i < SHORT_MIN_HISTORY) return [];
    const usual = median(totals.slice(Math.max(0, i - SHORT_LOOKBACK), i).map((x) => x.turnover));
    return usual !== null && usual > 0 && t.turnover < SHORT_SESSION_X * usual ? [t.date] : [];
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

/**
 * One stock's ₹ traded per window and its normal per session. No row for a window
 * it neither traded in nor has a normal for (nothing to say about it).
 */
export function flowStats(h: History, w: FlowWindows): FlowStat[] {
  return FLOW_PERIODS.flatMap((p) => {
    const inWin: number[] = [], inNormal: number[] = [];
    h.dates.forEach((d, i) => {
      if (d >= w.starts[p] && d <= w.asOf) inWin.push(i);
      else if (d >= w.normalFrom[p] && d <= w.normalTo[p]) inNormal.push(i);
    });
    const normalDaily = inNormal.length >= MIN_NORMAL ? inNormal.reduce((s, i) => s + h.turnover[i]!, 0) / inNormal.length : null;
    if (inWin.length === 0 && normalDaily === null) return [];
    return [{
      period: p,
      turnover: inWin.reduce((s, i) => s + h.turnover[i]!, 0),
      normalDaily,
      sessions: inWin.length,
      changePct: inWin.length ? windowMove(h, inWin[0]!, inWin.at(-1)!, w.asOf) : null,
    }];
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
