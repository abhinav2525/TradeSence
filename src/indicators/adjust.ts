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
