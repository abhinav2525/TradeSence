/**
 * The gap rule, shared by everything that walks a price series: averages
 * (compute.ts), crossings (query/crossings.ts) and daily moves. One copy, so
 * the threshold can't drift between them.
 */

/**
 * A gap longer than this means the series is discontinuous, not merely closed
 * for a holiday. NSE's longest normal break is a long weekend plus a holiday;
 * three weeks means data is genuinely missing.
 */
export const MAX_GAP_DAYS = 21;

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
