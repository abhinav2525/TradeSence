import { formatMonth } from "@/lib/format";

/**
 * X-axis ticks for a daily series: the first session of each year when the
 * window is long, of each month otherwise, thinned to at most `max`. Every
 * label is unique, so no axis ever reads "2020 2020" or "Feb ’20 Feb ’20".
 */
export function dateTicks(dates: string[], max = 8): { ticks: string[]; label: (d: string) => string } {
  const yearly = dates.length > 400;
  const key = (d: string) => (yearly ? d.slice(0, 4) : d.slice(0, 7));
  const firsts: string[] = [];
  for (let i = 0; i < dates.length; i++) {
    if (i === 0 || key(dates[i]!) !== key(dates[i - 1]!)) firsts.push(dates[i]!);
  }
  const step = Math.max(1, Math.ceil(firsts.length / max));
  return {
    ticks: firsts.filter((_, i) => i % step === 0),
    label: yearly ? (d) => d.slice(0, 4) : formatMonth,
  };
}
