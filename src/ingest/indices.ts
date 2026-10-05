/**
 * The indices tracked on true day-by-day membership (decision 0034). One entry
 * binds every name an index goes by, so no caller can mix them up: loading the
 * Nifty Bank file under the NIFTY 50's name is impossible because the file, the
 * stored name and the expected member counts sit in the same entry.
 *
 * - key: the pages' `u` parameter (the same keys Breadth's list selector uses)
 * - members: `index_members.index_name`
 * - prices: NSE's name in `index_prices` (the daily index-close file)
 * - list: the `INDEX_LISTS` key of NSE's live member list (the drift check)
 * - file: the hand-kept membership file next to this module
 * - sizes: how many members the index has from each date on; a size change is
 *   a rule change, so it is a reviewed code change here, not a CSV comment
 *
 * Pure data: no database import, so pages and tests can read it freely.
 * Adding an index = one entry here + its CSV + its live drift test.
 */
export type SizeStep = { from: string; n: number };

export type IndexEntry = {
  key: string;
  members: string;
  prices: string;
  list: string;
  label: string;
  file: URL;
  sizes: readonly SizeStep[];
};

export const NIFTY50 = {
  key: "nifty50",
  members: "NIFTY50",
  prices: "Nifty 50",
  list: "nifty-50",
  label: "NIFTY 50",
  file: new URL("./nifty50-history.csv", import.meta.url),
  sizes: [{ from: "2020-01-01", n: 50 }],
} as const satisfies IndexEntry;

export const NIFTY_BANK = {
  key: "bank",
  members: "NIFTYBANK",
  prices: "Nifty Bank",
  list: "bank",
  label: "Nifty Bank",
  file: new URL("./niftybank-history.csv", import.meta.url),
  // 12 until NSE's SEBI-driven change (press release ind_prs01122025), 14 from 2025-12-31.
  sizes: [{ from: "2020-01-01", n: 12 }, { from: "2025-12-31", n: 14 }],
} as const satisfies IndexEntry;

/** NIFTY 50 first: it is every page's default. */
export const INDICES: readonly IndexEntry[] = [NIFTY50, NIFTY_BANK];

export type IndexKey = (typeof NIFTY50)["key"] | (typeof NIFTY_BANK)["key"];

export function indexByKey(key: string): IndexEntry | undefined {
  return INDICES.find((x) => x.key === key);
}

/** The pages' `u` parameter: exactly a registered key, else the NIFTY 50. */
export function cleanIndex(v: string | undefined): IndexEntry {
  return INDICES.find((x) => x.key === v) ?? NIFTY50;
}

/** The expected member count on a date (the last step on or before it). */
export function sizeOn(sizes: readonly SizeStep[], dateIso: string): number {
  return sizes.filter((s) => s.from <= dateIso).at(-1)?.n ?? 0;
}
