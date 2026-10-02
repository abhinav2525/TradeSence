/**
 * Split/bonus adjustment for moving averages.
 *
 * Bhavcopy closes are unadjusted, so a 1:5 split reads as an 80% crash and
 * drags every average that spans it. Dividing each close by the product of the
 * factors of all events *after* it gives one continuous series, which is what
 * the averages are computed on. See docs/decisions/0002-split-adjusted-averages.md.
 */

export type AdjustingEvent = { exDate: string; factor: number };

/**
 * For each date, the product of factors of events with an ex-date strictly
 * after it. The ex-date itself already trades post-split, so it gets none.
 */
export function adjustmentFactors(dates: string[], events: AdjustingEvent[]): number[] {
  const sorted = [...events].sort((a, b) => (a.exDate < b.exDate ? 1 : -1)); // newest first
  const out = new Array<number>(dates.length);
  let cumulative = 1;
  let e = 0;

  for (let i = dates.length - 1; i >= 0; i--) {
    // Fold in every event that falls after this date.
    while (e < sorted.length && sorted[e]!.exDate > dates[i]!) {
      cumulative *= sorted[e]!.factor;
      e += 1;
    }
    out[i] = cumulative;
  }
  return out;
}

/** How far after the ex-date the first trade may be and still price the demerger. */
const DEMERGER_MAX_DAYS = 7;

/**
 * A demerger's adjustment factor, worked out from prices because NSE's
 * corporate-actions text carries no ratio.
 *
 * Last close before the ex-date divided by the ex-date's open. NSE runs a
 * special pre-open session on that day to discover the price of what remains,
 * so the open reflects the spun-off value without the day's ordinary trading.
 * For TATAMOTORS 2025 this gives 660.75 / 400 = 1.652; TradingView uses 1.656.
 *
 * Returns null when it cannot be worked out honestly — no trade before, no
 * trade within a week after, or an open at or above the last close (a
 * demerger hands value out, so the price must fall). The jump check then
 * reports the move instead of a guess being written.
 */
export function demergerFactor(
  dates: string[],
  opens: number[],
  closes: number[],
  exDate: string,
): number | null {
  const i = dates.findIndex((d) => d >= exDate);
  if (i <= 0) return null;
  const days = (Date.parse(`${dates[i]}T00:00:00Z`) - Date.parse(`${exDate}T00:00:00Z`)) / 86_400_000;
  if (days > DEMERGER_MAX_DAYS) return null;
  const f = closes[i - 1]! / opens[i]!;
  return Number.isFinite(f) && f > 1 ? f : null;
}

/** An overnight move beyond this, after adjustment, is assumed to be a missing action. */
const JUMP_LIMIT = 0.7;

export type UnexplainedJump = { date: string; from: number; to: number };

/**
 * Overnight moves of more than 30% (either way) that remain after adjustment.
 *
 * A NIFTY 50 stock almost never does that for real; when it shows up, a split
 * is missing from `corporate_actions` or its factor is wrong. Reports raw
 * closes so the message matches what bhavcopy says.
 */
export function findUnexplainedJumps(
  dates: string[],
  closes: number[],
  factors: number[],
): UnexplainedJump[] {
  const jumps: UnexplainedJump[] = [];
  for (let i = 1; i < closes.length; i++) {
    const ratio = (closes[i]! / factors[i]!) / (closes[i - 1]! / factors[i - 1]!);
    if (ratio < JUMP_LIMIT || ratio > 1 / JUMP_LIMIT) {
      jumps.push({ date: dates[i]!, from: closes[i - 1]!, to: closes[i]! });
    }
  }
  return jumps;
}
