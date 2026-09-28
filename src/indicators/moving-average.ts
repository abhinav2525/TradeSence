/**
 * Moving averages over a chronologically ordered price series.
 *
 * Both return an array the same length as the input, with `null` for positions
 * that do not yet have a full lookback window — so index alignment with the
 * source dates is preserved and callers never silently shift a series.
 */

/** Simple moving average: every day in the window counts equally. */
export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0) throw new Error(`period must be positive, got ${period}`);

  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Exponential moving average, seeded with the SMA of the first `period` values
 * — the conventional seeding, and the reason the first non-null EMA equals the
 * first non-null SMA.
 *
 * Each value depends on the previous one, so this cannot be expressed as a
 * plain window function; it has to be walked in order.
 */
export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0) throw new Error(`period must be positive, got ${period}`);
  if (values.length < period) return out;

  const k = 2 / (period + 1);

  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i]!;
  let prev = seed / period;
  out[period - 1] = prev;

  for (let i = period; i < values.length; i++) {
    prev = prev + k * (values[i]! - prev);
    out[i] = prev;
  }
  return out;
}
