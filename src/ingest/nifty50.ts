const NIFTY50_LIST_URL =
  "https://nsearchives.nseindia.com/content/indices/ind_nifty50list.csv";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export const INDEX_NAME = "NIFTY50";

/**
 * Current NIFTY 50 constituents, from NSE's published list. Membership itself
 * comes from nifty50-history.csv; this list is the nightly cross-check that
 * the file is still up to date.
 * Columns: Company Name, Industry, Symbol, Series, ISIN Code.
 */
export async function fetchNifty50Symbols(): Promise<string[]> {
  const { header, rows } = await fetchNifty50List();
  const iSymbol = header.indexOf("Symbol");
  if (iSymbol < 0) {
    throw new Error(`Unrecognised NIFTY 50 list header: ${header.join(",").slice(0, 120)}`);
  }
  return rows.map((f) => (f[iSymbol] ?? "").trim()).filter(Boolean);
}

/**
 * NSE's sector ("Industry") for each current member, keyed by symbol. Used by
 * tests/sectors.test.ts to check the hand-kept map in src/lib/sectors.ts.
 */
export async function fetchNifty50Industries(): Promise<Map<string, string>> {
  const { header, rows } = await fetchNifty50List();
  const iSymbol = header.indexOf("Symbol");
  const iIndustry = header.indexOf("Industry");
  if (iSymbol < 0 || iIndustry < 0) {
    throw new Error(`Unrecognised NIFTY 50 list header: ${header.join(",").slice(0, 120)}`);
  }
  return new Map(
    rows
      .map((f) => [(f[iSymbol] ?? "").trim(), (f[iIndustry] ?? "").trim()] as const)
      .filter(([s, i]) => s && i),
  );
}

async function fetchNifty50List(): Promise<{ header: string[]; rows: string[][] }> {
  const res = await fetch(NIFTY50_LIST_URL, { headers: { "User-Agent": USER_AGENT } });
  if (res.status !== 200) {
    throw new Error(`NIFTY 50 list fetch failed: HTTP ${res.status}`);
  }
  const lines = (await res.text()).split(/\r?\n/).filter((l) => l.trim() !== "");
  const header = (lines[0] ?? "").split(",").map((c) => c.trim());
  return { header, rows: lines.slice(1).map((l) => l.split(",")) };
}
