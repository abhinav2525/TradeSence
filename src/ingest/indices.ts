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
 * - term: its own glossary entry (`src/lib/glossary.ts`), e.g. the Breadth tile's ⓘ
 *
 * Pure data: no database import, so pages and tests can read it freely.
 * Adding an index = one entry here + its CSV + its live drift test + its glossary entry.
 * Order matters: a stock in several indices opens on the earliest one's card (decision 0035).
 */
import type { TermId } from "../lib/glossary";

export type SizeStep = { from: string; n: number };

export type IndexEntry = {
  key: string;
  members: string;
  prices: string;
  list: string;
  label: string;
  term: TermId;
  file: URL;
  sizes: readonly SizeStep[];
};

export const NIFTY50 = {
  key: "nifty50",
  members: "NIFTY50",
  prices: "Nifty 50",
  list: "nifty-50",
  label: "NIFTY 50",
  term: "nifty50",
  file: new URL("./nifty50-history.csv", import.meta.url),
  sizes: [{ from: "2020-01-01", n: 50 }],
} as const satisfies IndexEntry;

export const NIFTY_BANK = {
  key: "bank",
  members: "NIFTYBANK",
  prices: "Nifty Bank",
  list: "bank",
  label: "Nifty Bank",
  term: "nifty-bank",
  file: new URL("./niftybank-history.csv", import.meta.url),
  // 12 until NSE's SEBI-driven change (press release ind_prs01122025), 14 from 2025-12-31.
  sizes: [{ from: "2020-01-01", n: 12 }, { from: "2025-12-31", n: 14 }],
} as const satisfies IndexEntry;

export const NIFTY_FIN_SERVICE = {
  key: "financial-services",
  members: "NIFTYFINSERVICE",
  prices: "Nifty Financial Services",
  list: "financial-services",
  label: "Nifty Financial Services",
  term: "nifty-financial-services",
  file: new URL("./niftyfinservice-history.csv", import.meta.url),
  sizes: [{ from: "2020-01-01", n: 20 }], // 20 throughout (decision 0037)
} as const satisfies IndexEntry;

/** NIFTY 50 first: it is every page's default. Then Nifty Bank, then Nifty Financial Services. */
export const INDICES = [NIFTY50, NIFTY_BANK, NIFTY_FIN_SERVICE] as const satisfies readonly IndexEntry[];

export type IndexKey = (typeof INDICES)[number]["key"];

export function indexByKey(key: string): IndexEntry | undefined {
  return (INDICES as readonly IndexEntry[]).find((x) => x.key === key);
}

/** True for exactly a registered key (strict comparisons, no lookups on an object). */
export function isIndexKey(v: string | undefined): v is IndexKey {
  return INDICES.some((x) => x.key === v);
}

/** The pages' `u` parameter: exactly a registered key, else the NIFTY 50. */
export function cleanIndex(v: string | undefined): IndexEntry {
  return indexByKey(v ?? "") ?? NIFTY50;
}

/** `bun run ingest:members <key> [--force]`'s arguments; null (print usage) for anything else. */
export function parseMembersArgs(argv: readonly string[]): { entry: IndexEntry; force: boolean } | null {
  const [key, ...rest] = argv;
  const entry = key ? indexByKey(key) : undefined;
  if (!entry || rest.some((a) => a !== "--force")) return null;
  return { entry, force: rest.includes("--force") };
}

/** The expected member count on a date (the last step on or before it). */
export function sizeOn(sizes: readonly SizeStep[], dateIso: string): number {
  return sizes.filter((s) => s.from <= dateIso).at(-1)?.n ?? 0;
}

/** The `u` part of a link: nothing for the NIFTY 50 (the default), so existing URLs are unchanged. */
export function uParam(entry: IndexEntry): string {
  return entry.key === NIFTY50.key ? "" : `&u=${entry.key}`;
}

/** "NIFTY 50, Nifty Bank or Nifty Financial Services": every registered index, for a sentence. */
export function indexLabels(): string {
  const l = INDICES.map((x) => x.label);
  return l.length < 2 ? l.join("") : `${l.slice(0, -1).join(", ")} or ${l.at(-1)}`;
}

/** "Nifty Bank's", "Nifty Financial Services'": a name ending in s takes the apostrophe alone. */
export function possessive(label: string): string {
  return label.endsWith("s") ? `${label}'` : `${label}'s`;
}

/** "Nifty Bank's 14 members" on a date. */
export function membersPhrase(entry: IndexEntry, dateIso: string): string {
  return `${possessive(entry.label)} ${sizeOn(entry.sizes, dateIso)} members`;
}
