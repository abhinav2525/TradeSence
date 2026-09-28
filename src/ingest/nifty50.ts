import { db, schema } from "../db";

const NIFTY50_LIST_URL =
  "https://nsearchives.nseindia.com/content/indices/ind_nifty50list.csv";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export const INDEX_NAME = "NIFTY50";

/**
 * Current NIFTY 50 constituents, from NSE's published list.
 * Columns: Company Name, Industry, Symbol, Series, ISIN Code.
 */
export async function fetchNifty50Symbols(): Promise<string[]> {
  const res = await fetch(NIFTY50_LIST_URL, { headers: { "User-Agent": USER_AGENT } });
  if (res.status !== 200) {
    throw new Error(`NIFTY 50 list fetch failed: HTTP ${res.status}`);
  }
  const lines = (await res.text()).split(/\r?\n/).filter((l) => l.trim() !== "");
  const header = (lines[0] ?? "").split(",").map((c) => c.trim());
  const iSymbol = header.indexOf("Symbol");
  if (iSymbol < 0) {
    throw new Error(`Unrecognised NIFTY 50 list header: ${lines[0]?.slice(0, 120)}`);
  }
  return lines.slice(1).map((l) => (l.split(",")[iSymbol] ?? "").trim()).filter(Boolean);
}

/**
 * Seeds membership as one open interval per current constituent.
 *
 * This is the survivorship-biased v1 documented in the plan: it asserts today's
 * 50 names were members for the whole backfill window. The table shape already
 * supports real point-in-time history, so correcting it later is an insert.
 */
export async function seedNifty50(addedOn: string): Promise<number> {
  const symbols = await fetchNifty50Symbols();
  await db
    .insert(schema.indexMembers)
    .values(symbols.map((symbol) => ({ indexName: INDEX_NAME, symbol, addedOn, removedOn: null })))
    .onConflictDoNothing();
  return symbols.length;
}
