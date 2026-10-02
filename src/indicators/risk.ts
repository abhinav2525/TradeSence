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
