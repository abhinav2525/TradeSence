/**
 * Chart series trimmed for the browser. The Report Card's charts need paise and
 * hundredths of a percent; sending 15 decimals added ~100 KB per page and helped
 * trip Next's gzip "MaxListeners" warning (decision 0026). Display only: the
 * report's own numbers (and the audit) are untouched.
 */
const r2 = (v: number) => Math.round(v * 100) / 100;

export function chartPrice(points: { date: string; close: number; sma200: number | null }[]) {
  return points.map((p) => ({ date: p.date, close: r2(p.close), sma200: p.sma200 === null ? null : r2(p.sma200) }));
}

export function chartDrawdown(points: { date: string; pct: number }[]) {
  return points.map((p) => ({ date: p.date, pct: r2(p.pct) }));
}
