/**
 * Risk measures for the Stock Report Card, all from the adjusted daily moves
 * (daily_indicators.change_pct), so splits, demergers and renames can't fake a
 * fall. Spec: docs/superpowers/specs/2026-10-02-stock-report-card-design.md;
 * thresholds and why: docs/decisions/0011-stock-report-card.md.
 */

export type MovePoint = { date: string; changePct: number | null };
export type LinePoint = { date: string; level: number; segment: number };

/** Chains daily moves into a price line starting at 100. A missing move starts a new segment. */
export function adjustedLine(points: MovePoint[]): LinePoint[] {
  const out: LinePoint[] = [];
  let level = 100;
  let segment = 0;
  points.forEach((p, i) => {
    if (i > 0) {
      if (p.changePct === null) segment += 1;
      else level *= 1 + p.changePct / 100;
    }
    out.push({ date: p.date, level, segment });
  });
  return out;
}

/** % below the running peak (0 at a new high). The peak resets at each segment start. */
export function drawdownSeries(line: LinePoint[]): { date: string; pct: number }[] {
  let peak = -Infinity;
  let seg = -1;
  return line.map((p) => {
    if (p.segment !== seg) { seg = p.segment; peak = p.level; }
    peak = Math.max(peak, p.level);
    return { date: p.date, pct: (p.level / peak - 1) * 100 };
  });
}

export type Drawdown = {
  depthPct: number;
  peakDate: string;
  troughDate: string;
  recoveryDate: string | null;
  sessionsToRecover: number | null;
};

/** The deepest fall from a peak, and when (if ever) the line got back to that peak. */
export function worstDrawdown(line: LinePoint[]): Drawdown | null {
  if (line.length === 0) return null;
  let best: { depth: number; peakI: number; troughI: number } | null = null;
  let peakI = 0;
  for (let i = 0; i < line.length; i++) {
    if (i === 0 || line[i]!.segment !== line[i - 1]!.segment || line[i]!.level >= line[peakI]!.level) peakI = i;
    const depth = (line[i]!.level / line[peakI]!.level - 1) * 100;
    if (!best || depth < best.depth) best = { depth, peakI, troughI: i };
  }
  if (!best || best.depth >= 0) {
    return { depthPct: 0, peakDate: line[0]!.date, troughDate: line[0]!.date, recoveryDate: null, sessionsToRecover: null };
  }
  const peak = line[best.peakI]!;
  let recoverI: number | null = null;
  for (let i = best.troughI + 1; i < line.length; i++) {
    if (line[i]!.segment !== peak.segment) break;
    if (line[i]!.level >= peak.level) { recoverI = i; break; }
  }
  return {
    depthPct: best.depth,
    peakDate: peak.date,
    troughDate: line[best.troughI]!.date,
    recoveryDate: recoverI === null ? null : line[recoverI]!.date,
    // counted from the peak: "how long until it was back where it started falling"
    sessionsToRecover: recoverI === null ? null : recoverI - best.peakI,
  };
}

export function currentDrawdownPct(line: LinePoint[]): number | null {
  return drawdownSeries(line).at(-1)?.pct ?? null;
}

/** Index closes → daily moves, so the NIFTY 50 goes through the same functions as a stock. */
export function closesToMoves(rows: { date: string; close: number }[]): MovePoint[] {
  return rows.map((r, i) => ({ date: r.date, changePct: i === 0 ? null : (r.close / rows[i - 1]!.close - 1) * 100 }));
}

export const HORIZONS = { "1w": 5, "1m": 21, "3m": 63, "1y": 250 } as const;
export type HorizonKey = keyof typeof HORIZONS;

export type Bin = { from: number; to: number; count: number };
export type HorizonStats = {
  sessions: number;
  windows: number;
  p10: number;
  median: number;
  worst: number;
  worstStart: string;
  shareNegative: number;
  bins: Bin[];
};

const quantile = (sorted: number[], q: number) => {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  return sorted[lo]! + (sorted[Math.ceil(pos)]! - sorted[lo]!) * (pos - lo);
};

/** Twenty equal-width bins over the observed range, for the calculator's histogram. */
function binsOf(values: number[]): Bin[] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const width = (hi - lo) / 20 || 1;
  const bins = Array.from({ length: 20 }, (_, i) => ({ from: lo + i * width, to: lo + (i + 1) * width, count: 0 }));
  for (const v of values) bins[Math.min(19, Math.floor((v - lo) / width))]!.count += 1;
  return bins;
}

/**
 * Every `sessions`-long stretch in the history (overlapping), as % returns.
 * Null with less than three horizons of history: too few stretches to say
 * what "typical" looks like.
 */
export function horizonStats(line: LinePoint[], sessions: number): HorizonStats | null {
  if (line.length < 3 * sessions) return null;
  const rets: { r: number; start: string }[] = [];
  for (let i = sessions; i < line.length; i++) {
    const a = line[i - sessions]!;
    const b = line[i]!;
    if (a.segment !== b.segment) continue;
    rets.push({ r: (b.level / a.level - 1) * 100, start: a.date });
  }
  if (rets.length === 0) return null;
  const sorted = rets.map((x) => x.r).sort((x, y) => x - y);
  const worst = rets.reduce((w, x) => (x.r < w.r ? x : w));
  return {
    sessions,
    windows: rets.length,
    p10: quantile(sorted, 0.1),
    median: quantile(sorted, 0.5),
    worst: worst.r,
    worstStart: worst.start,
    // a stretch back at exactly its starting price did not end lower (decision 0013)
    shareNegative: (rets.filter((x) => x.r < -NOISE_PCT).length / rets.length) * 100,
    bins: binsOf(sorted),
  };
}

/** % change over the last `sessions` sessions, if they're all in one segment. */
export function periodReturn(line: LinePoint[], sessions: number): number | null {
  const end = line.at(-1);
  const start = line.at(-1 - sessions);
  if (!end || !start || start.segment !== end.segment) return null;
  return (end.level / start.level - 1) * 100;
}

export const VOL_WINDOW = 250;
/** A worst fall measured over less than a year of sessions isn't a stock's worst fall. */
export const DRAWDOWN_MIN = 250;
export const VOL_MIN = 60;

/** Sample std. dev. of the last 250 daily moves (%); null with under 60. */
export function dailyVolatility(moves: (number | null)[]): number | null {
  const xs = moves.filter((m): m is number => m !== null).slice(-VOL_WINDOW);
  if (xs.length < VOL_MIN) return null;
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1));
}

/** % of `all` at or below `value`. */
export function percentRank(value: number, all: number[]): number {
  return all.length === 0 ? 0 : (all.filter((x) => x <= value).length / all.length) * 100;
}

/**
 * % points. A gap smaller than this is the same number computed two ways
 * (floating-point noise is ~1e-13 here), never a real difference between two
 * stocks or a real loss (decision 0013). Use it wherever returns are compared.
 */
export const NOISE_PCT = 1e-9;

/**
 * % of the OTHER members whose value is below this stock's, by more than noise.
 * The stock is removed by symbol, never by comparing its value with itself:
 * the same return computed over two spans differs in the 14th decimal, which
 * dropped half the stocks from their own ranking (decision 0013).
 */
export function rankAmongPeers(
  symbol: string,
  value: number,
  peers: { symbol: string; value: number }[],
): { pct: number; of: number; below: number } | null {
  const others = peers.filter((p) => p.symbol !== symbol);
  if (others.length === 0) return null;
  const below = others.filter((p) => p.value < value - NOISE_PCT).length;
  return { pct: (below / others.length) * 100, of: others.length, below };
}

export type Light = "green" | "amber" | "red";

/** Every light's cut-off, in one place (decisions 0011 and 0014). */
export const THRESHOLDS = {
  strength: { green: 67, red: 33 }, // percentile among members
  ratio: { green: 1.2, amber: 1.8 }, // × the NIFTY 50 (bumpiness, worst fall, in crashes)
  liquidityCrore: { green: 100, amber: 10 },
  liquiditySessions: 20,
  nowVol: { green: 1.0, amber: 1.5 }, // recent σ ÷ its own last year
  downCapture: { green: 100, amber: 120 }, // % of the NIFTY's fall on its down days
  crashMinEpisodes: 3,
} as const;

export function trendLight(close: number, sma50: number | null, sma200: number | null): Light | null {
  if (sma50 === null || sma200 === null) return null;
  const n = Number(close > sma50) + Number(close > sma200);
  return n === 2 ? "green" : n === 1 ? "amber" : "red";
}

export function strengthLight(pct: number): Light {
  return pct >= THRESHOLDS.strength.green ? "green" : pct <= THRESHOLDS.strength.red ? "red" : "amber";
}

export function ratioLight(ratio: number): Light {
  return ratio <= THRESHOLDS.ratio.green ? "green" : ratio <= THRESHOLDS.ratio.amber ? "amber" : "red";
}

export function liquidityLight(crore: number): Light {
  return crore >= THRESHOLDS.liquidityCrore.green ? "green" : crore >= THRESHOLDS.liquidityCrore.amber ? "amber" : "red";
}

export function nowVolLight(ratio: number): Light {
  return ratio <= THRESHOLDS.nowVol.green ? "green" : ratio <= THRESHOLDS.nowVol.amber ? "amber" : "red";
}

export function downCaptureLight(pct: number): Light {
  return pct <= THRESHOLDS.downCapture.green ? "green" : pct <= THRESHOLDS.downCapture.amber ? "amber" : "red";
}
