/**
 * Reader-facing wording and input handling for the Stock Report Card, kept
 * apart from the components so it can be tested (decision 0011).
 */
import type { HorizonKey } from "@/indicators/risk";
import { INDICES, NIFTY50 } from "@/ingest/indices";

/**
 * The calculator counts every overlapping stretch, so ten years hold ~2,460
 * month-long stretches. Calling them "months" would overstate the evidence.
 */
export const HORIZON_LABELS: Record<HorizonKey, { one: string; many: string; button: string }> = {
  "1w": { one: "week-long stretch", many: "week-long stretches", button: "1 week" },
  "1m": { one: "month-long stretch", many: "month-long stretches", button: "1 month" },
  "3m": { one: "3-month stretch", many: "3-month stretches", button: "3 months" },
  "1y": { one: "year-long stretch", many: "year-long stretches", button: "1 year" },
};

/** The amount as typed (₹), or null when there's no usable positive amount. Never silently changed. */
export function parseAmount(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export const LIGHTS_DISCLAIMER =
  "Lights compare this stock's past behaviour with the NIFTY 50. They are not advice to buy or sell.";

export type StockGroup = { title: string; stocks: { symbol: string }[] };

/**
 * The /stock index's groups (decision 0035): NIFTY 50 members (once, even when also in
 * another index), then each other index's members not in the NIFTY 50, then former members.
 */
export function stockGroups<S extends { symbol: string; current: boolean; currentIn: string[] }>(stocks: S[]): { title: string; stocks: S[] }[] {
  return [
    { title: `In the ${NIFTY50.label}`, stocks: stocks.filter((s) => s.currentIn.includes(NIFTY50.key)) },
    ...INDICES.filter((ix) => ix.key !== NIFTY50.key).map((ix) => ({
      title: `In ${ix.label}, not the ${NIFTY50.label}`,
      stocks: stocks.filter((s) => s.currentIn.includes(ix.key) && !s.currentIn.includes(NIFTY50.key)),
    })),
    { title: "Former members since 2020", stocks: stocks.filter((s) => !s.current) },
  ];
}
