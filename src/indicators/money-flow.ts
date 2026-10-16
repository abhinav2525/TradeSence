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

/**
 * A stock's normal ₹ per session: the mean over the sessions it traded in
 * [from, to], null under MIN_NORMAL of them. The one rule behind Money flow and
 * Top volume's "× normal" (decision 0040), so a stock reads the same on both.
 */
export function normalDaily(h: History, from: string, to: string): number | null {
  const [c, d] = span(h.dates, from, to);
  let sum = 0;
  for (let i = c; i < d; i++) sum += h.turnover[i]!;
  return d - c >= MIN_NORMAL ? sum / (d - c) : null;
}

/** The shared core of a window's stats: one rule for the bars and the weekly history. */
function windowStat(h: History, period: FlowPeriod, start: string, end: string, normalFrom: string, normalTo: string): FlowStat | null {
  const [a, b] = span(h.dates, start, end);
  const normal = normalDaily(h, normalFrom, normalTo);
  if (b === a && normal === null) return null;
  let turnover = 0;
  for (let i = a; i < b; i++) turnover += h.turnover[i]!;
  return { period, turnover, normalDaily: normal, sessions: b - a, changePct: b > a ? windowMove(h, a, b - 1, end) : null };
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
  counted: number; // stocks with a normal that traded in the window (the ratio's stocks)
  busier: number; // of those, traded more than their normal (strictly)
  loudest: string | null; // the counted stock with the most ₹ above its normal; null if none is above
  ratioWithoutLoudest: number | null; // the ratio over the counted stocks minus the loudest; = ratio without one; null if none left
};

/** A sector whose without-ratio rests on this few counted stocks is marked "few stocks". */
export const BUSY_SECTOR_FEW = MIN_SECTOR_STOCKS;

/** The page's `loud` param: exactly "hide" hides each sector's loudest stock; anything else shows all. */
export function cleanLoud(v: string | undefined): boolean {
  return v === "hide";
}

/** Stocks with a normal that traded in the window: the ones a ratio is measured on. */
const counted = (rs: FlowRow[]) => rs.filter((r) => r.normalDaily !== null && r.turnover > 0);
const isBusier = (r: FlowRow, period: number) => r.turnover > r.normalDaily! * period;

/** The whole market's "b of n busier", over every stock with a normal that traded (small sectors too). */
export function marketBusier(rows: FlowRow[], period: FlowPeriod): { busier: number; counted: number } {
  const c = counted(rows);
  return { busier: c.filter((r) => isBusier(r, period)).length, counted: c.length };
}

/** The ratio the bars draw: without the loudest stock when the toggle is on. */
export function shownRatio(s: SectorFlow, hideLoudest: boolean): number | null {
  return hideLoudest ? s.ratioWithoutLoudest : s.ratio;
}

/** Sectors by the shown ratio, busiest first, ties by name (sectorFlows' own order when off). A new array. */
export function sortSectors(sectors: SectorFlow[], hideLoudest: boolean): SectorFlow[] {
  const r = (s: SectorFlow) => shownRatio(s, hideLoudest) ?? -Infinity;
  return [...sectors].sort((a, b) => r(b) - r(a) || a.sector.localeCompare(b.sector));
}

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
    const withNormal = counted(rs);
    const expected = withNormal.reduce((s, r) => s + r.normalDaily! * period, 0);
    const ratio = expected > 0 ? withNormal.reduce((s, r) => s + r.turnover, 0) / expected : null;
    // Loudest: the most ₹ above its own normal, ties by symbol; only a stock above its normal qualifies.
    const extra = (r: FlowRow) => r.turnover - r.normalDaily! * period;
    const loud = withNormal.filter((r) => isBusier(r, period))
      .sort((a, b) => extra(b) - extra(a) || a.symbol.localeCompare(b.symbol))[0] ?? null;
    const rest = loud ? withNormal.filter((r) => r !== loud) : withNormal;
    const restExpected = rest.reduce((s, r) => s + r.normalDaily! * period, 0);
    const moves = rs.map((r) => r.changePct).filter((v): v is number => v !== null);
    const normalSum = rs.reduce((s, r) => s + (r.normalDaily ?? 0), 0);
    sectors.push({
      sector, stocks: rs.length,
      ratio,
      share: total > 0 ? rs.reduce((s, r) => s + r.turnover, 0) / total : 0,
      usualShare: totalNormal > 0 ? normalSum / totalNormal : null,
      medianMove: median(moves),
      up: moves.filter((m) => m > NOISE_PCT).length,
      down: moves.filter((m) => m < -NOISE_PCT).length,
      counted: withNormal.length,
      busier: withNormal.filter((r) => isBusier(r, period)).length,
      loudest: loud?.symbol ?? null,
      ratioWithoutLoudest: !loud ? ratio : restExpected > 0 ? rest.reduce((s, r) => s + r.turnover, 0) / restExpected : null,
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

export type SectorWeek = {
  weekEnd: string; sector: string; ratio: number | null; medianMove: number | null; stocks: number; shortSession: boolean;
  turnover: number; // the sector's ₹ that week
  totalTurnover: number; // every universe stock's ₹ that week, small sectors included (same on each of the week's rows)
  newListingTurnover: number | null; // the sector's ₹ that week from new listings (newListings); null without a year-ago block
};

/** Sectors that get rows: at least MIN_SECTOR_STOCKS stocks on today's list, chosen once (not week by week). */
export function shownSectors(stocks: { sector: string }[]): string[] {
  const n = new Map<string, number>();
  for (const s of stocks) n.set(s.sector, (n.get(s.sector) ?? 0) + 1);
  return [...n].filter(([, c]) => c >= MIN_SECTOR_STOCKS).map(([s]) => s).sort();
}

/**
 * Each shown sector's 1-week reading per week. Ratio and median move come from sectorFlows, so a week where the
 * sector had under 5 stocks with data has none (null); its ₹ is still there, so its share line has no hole.
 */
export function weeklySectorFlows(
  stocks: { symbol: string; sector: string; h: History }[], weeks: WeekWindow[], short: Set<string>, isNew: Set<string> | null,
): SectorWeek[] {
  const shorts = [...short];
  const shown = shownSectors(stocks);
  return weeks.flatMap((wk) => {
    const rows: FlowRow[] = stocks.flatMap(({ symbol, sector, h }) => {
      const s = windowStat(h, 5, wk.start, wk.end, wk.normalFrom, wk.normalTo);
      return s ? [{ symbol, sector, turnover: s.turnover, normalDaily: s.normalDaily, changePct: s.changePct }] : [];
    });
    const shortSession = shorts.some((d) => d >= wk.start && d <= wk.end);
    const totalTurnover = rows.reduce((s, r) => s + r.turnover, 0);
    const flows = new Map(sectorFlows(rows, 5).sectors.map((x) => [x.sector, x]));
    return shown.map((sector) => {
      const rs = rows.filter((r) => r.sector === sector);
      const f = flows.get(sector);
      return {
        weekEnd: wk.end, sector, ratio: f?.ratio ?? null, medianMove: f?.medianMove ?? null, stocks: rs.length, shortSession,
        turnover: rs.reduce((s, r) => s + r.turnover, 0), totalTurnover,
        newListingTurnover: isNew ? rs.filter((r) => isNew.has(r.symbol)).reduce((s, r) => s + r.turnover, 0) : null,
      };
    });
  });
}

// ── Share of trading over a year (spec 2026-10-07-sector-share-of-trading, decision 0041) ──

export const SHARE_BLOCK_SESSIONS = 63; // "now": the last 3 months of sessions (owner's choice, 7 Oct 2026)
/** A fixed display rule, never tuned: a row is marked when new listings are this much of its recent ₹. */
export const NEW_LISTING_MARK = 0.1;
/**
 * A fixed display rule, never tuned: a row is flagged when one of its stocks demerged inside the comparison and that
 * stock was this much of the sector's year-ago ₹ (part of that trading now belongs to another company).
 */
export const DEMERGER_MARK = 0.01;
const MARK_EPS = 1e-9; // 0.3 / 3 is 0.09999999999999999 in floating point: exactly the mark is marked

/** The same calendar date one year earlier; 29 February becomes 28 February. */
export function yearBefore(iso: string): string {
  const y = String(Number(iso.slice(0, 4)) - 1).padStart(4, "0");
  const md = iso.slice(5) === "02-29" ? "02-28" : iso.slice(5);
  return `${y}-${md}`;
}

export type ShareBlocks = { nowFrom: string; nowTo: string; agoFrom: string; agoTo: string };

/**
 * Now = the last SHARE_BLOCK_SESSIONS sessions; a year ago = the sessions inside the same calendar span one year
 * earlier. `days` newest first. Null (needs a year of history) unless the year-ago span has sessions and the list
 * reaches before it, so a partly held year-ago block is never read as complete.
 */
export function shareBlocks(days: string[]): ShareBlocks | null {
  if (days.length < SHARE_BLOCK_SESSIONS) return null;
  const nowTo = days[0]!, nowFrom = days[SHARE_BLOCK_SESSIONS - 1]!;
  const agoFrom = yearBefore(nowFrom), agoTo = yearBefore(nowTo);
  if (!(days.at(-1)! < agoFrom)) return null;
  if (!days.some((d) => d >= agoFrom && d <= agoTo)) return null;
  return { nowFrom, nowTo, agoFrom, agoTo };
}

/** A stock's ₹ and traded sessions in [from, to]. */
function rupeesIn(h: History, from: string, to: string): { rupees: number; sessions: number } {
  const [a, b] = span(h.dates, from, to);
  let rupees = 0, sessions = 0;
  for (let i = a; i < b; i++) { rupees += h.turnover[i]!; if (h.turnover[i]! > 0) sessions++; }
  return { rupees, sessions };
}

/** Stocks with no traded session in the year-ago block: this year's new listings (and long-suspended stocks). */
export function newListings(stocks: { symbol: string; h: History }[], b: ShareBlocks): Set<string> {
  return new Set(stocks.filter(({ h }) => rupeesIn(h, b.agoFrom, b.agoTo).sessions === 0).map((s) => s.symbol));
}

export type ShareYearRow = {
  sector: string; stocks: number;
  nowTurnover: number; nowTotal: number; agoTurnover: number; agoTotal: number;
  newListingTurnover: number; // the sector's now-block ₹ from newListings
  demerged: Demerged[]; // its stocks that demerged after the year-ago block began (DEMERGER_MARK), by symbol
};
export type Demerged = { symbol: string; exDate: string };

/**
 * Per shown sector (today's list, ≥ MIN_SECTOR_STOCKS), pooled ₹ in both blocks, summed over the same stocks whatever
 * their count a year ago. Totals are every stock's ₹, small sectors included, so small sectors = total − rows.
 */
export function sectorShareYear(stocks: { symbol: string; sector: string; h: History }[], b: ShareBlocks): ShareYearRow[] {
  const shown = new Set(shownSectors(stocks));
  const isNew = newListings(stocks, b);
  let nowTotal = 0, agoTotal = 0;
  const by = new Map<string, ShareYearRow>();
  // A demerger on the year-ago block's first day or before leaves both blocks after the split: nothing to flag.
  const candidates: { sector: string; symbol: string; exDate: string; ago: number }[] = [];
  for (const { symbol, sector, h } of stocks) {
    const now = rupeesIn(h, b.nowFrom, b.nowTo).rupees, ago = rupeesIn(h, b.agoFrom, b.agoTo).rupees;
    nowTotal += now; agoTotal += ago;
    if (!shown.has(sector)) continue;
    const r = by.get(sector) ?? by.set(sector, { sector, stocks: 0, nowTurnover: 0, nowTotal: 0, agoTurnover: 0, agoTotal: 0, newListingTurnover: 0, demerged: [] }).get(sector)!;
    r.stocks++; r.nowTurnover += now; r.agoTurnover += ago;
    if (isNew.has(symbol)) r.newListingTurnover += now;
    for (const exDate of h.demergers ?? []) if (exDate > b.agoFrom && exDate <= b.nowTo) candidates.push({ sector, symbol, exDate, ago });
  }
  for (const c of candidates) {
    const r = by.get(c.sector)!;
    if (r.agoTurnover > 0 && c.ago / r.agoTurnover >= DEMERGER_MARK - MARK_EPS) r.demerged.push({ symbol: c.symbol, exDate: c.exDate });
  }
  return [...by.values()]
    .map((r) => ({ ...r, nowTotal, agoTotal, demerged: r.demerged.sort((x, y) => x.symbol.localeCompare(y.symbol) || x.exDate.localeCompare(y.exDate)) }))
    .sort((a, b) => a.sector.localeCompare(b.sector));
}

export type ShareTrend = {
  sector: string; stocks: number;
  nowPct: number; agoPct: number | null; changePts: number | null; // shares in %, change in percentage points
  newListingPct: number | null; partlyNew: boolean;
  demerged: Demerged[];
};

/** Shares from pooled ₹ (never a mean of weekly shares), change in points, largest gain first (ties by name); small sectors' share. */
export function shareChange(rows: ShareYearRow[]): { rows: ShareTrend[]; small: { nowPct: number; agoPct: number | null } } {
  const pct = (part: number, whole: number) => (whole > 0 ? (100 * part) / whole : null);
  const out = rows.map((r) => {
    const nowPct = pct(r.nowTurnover, r.nowTotal) ?? 0;
    const agoPct = pct(r.agoTurnover, r.agoTotal);
    const nl = r.nowTurnover > 0 ? r.newListingTurnover / r.nowTurnover : null;
    return {
      sector: r.sector, stocks: r.stocks, nowPct, agoPct, changePts: agoPct === null ? null : nowPct - agoPct,
      newListingPct: nl === null ? null : 100 * nl, partlyNew: nl !== null && nl >= NEW_LISTING_MARK - MARK_EPS,
      demerged: r.demerged,
    };
  });
  out.sort((a, b) => (b.changePts ?? -Infinity) - (a.changePts ?? -Infinity) || a.sector.localeCompare(b.sector));
  const first = rows[0];
  const shownNow = rows.reduce((s, r) => s + r.nowTurnover, 0), shownAgo = rows.reduce((s, r) => s + r.agoTurnover, 0);
  return {
    rows: out,
    small: {
      nowPct: first ? pct(first.nowTotal - shownNow, first.nowTotal) ?? 0 : 0,
      agoPct: first ? pct(first.agoTotal - shownAgo, first.agoTotal) : null,
    },
  };
}

/** Market-wide ₹ per session across these histories, oldest first, from a date: input to shortSessions. */
export function marketTotals(histories: History[], from: string): { date: string; turnover: number }[] {
  const by = new Map<string, number>();
  for (const h of histories) h.dates.forEach((d, i) => { if (d >= from) by.set(d, (by.get(d) ?? 0) + h.turnover[i]!); });
  return [...by.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, turnover]) => ({ date, turnover }));
}
