/**
 * Breadth beyond the NIFTY 50 (decision 0030): how many stocks close above each
 * average, per day, for the whole liquid market and for NSE's index lists. Pure;
 * computeBreadth writes the counts to breadth_daily.
 */
import { INDEX_LISTS } from "../ingest/index-constituents";
import type { MaKind } from "../lib/ma";

export const MA_KINDS: readonly MaKind[] = ["sma50", "sma200", "ema200"];
export type DayCounts = Record<MaKind, { above: number; total: number }>;
export type Counts = Map<string, DayCounts>;

export const newCounts = (): Counts => new Map();

type StockAverages = { dates: string[]; adjusted: number[]; sma50: (number | null)[]; sma200: (number | null)[]; ema200: (number | null)[] };

/**
 * Adds one stock's days to the counts: on each included day with an average, it
 * counts in `total`, and in `above` when its adjusted close is strictly above. A
 * null average leaves the stock out (never "below"). With `onlyDate`, only that day.
 */
export function addStock(c: Counts, s: StockAverages, include: boolean[], onlyDate?: string): void {
  const idx = onlyDate === undefined ? s.dates.map((_, i) => i) : [s.dates.lastIndexOf(onlyDate)].filter((i) => i >= 0);
  for (const i of idx) {
    if (!include[i]) continue;
    const d = s.dates[i]!;
    for (const k of MA_KINDS) {
      const m = s[k][i];
      if (m == null) continue;
      let day = c.get(d);
      if (!day) { day = { sma50: { above: 0, total: 0 }, sma200: { above: 0, total: 0 }, ema200: { above: 0, total: 0 } }; c.set(d, day); }
      day[k].total++;
      if (s.adjusted[i]! > m) day[k].above++;
    }
  }
}

/** Index lists offered besides the NIFTY 50 (NSE's own nifty-50 file is left out: the point-in-time NIFTY 50 exists). */
export const LIST_UNIVERSES = INDEX_LISTS.filter((x) => x.key !== "nifty-50");
export type Universe = "nifty50" | "market" | (typeof LIST_UNIVERSES)[number]["key"];

/** The page's `u` param: exactly one of the known keys, else the NIFTY 50. */
export function cleanUniverse(v: string | undefined): Universe {
  if (v === "market") return "market";
  const hit = LIST_UNIVERSES.find((x) => x.key === v);
  return hit ? hit.key : "nifty50";
}
