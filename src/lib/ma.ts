/**
 * The three averages the dashboard offers and their labels. Pure, with no
 * imports, so browser-side code (MaTabs, the design-system bundle) can use them
 * without pulling in the database. `src/query/breadth.ts` maps each to its
 * stored column and re-exports these.
 */
export type MaKind = "sma200" | "ema200" | "sma50";

export const MA_LABELS: Record<MaKind, string> = {
  sma200: "200-day SMA",
  ema200: "200-day EMA",
  sma50: "50-day SMA",
};
