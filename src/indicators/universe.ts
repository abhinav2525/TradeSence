/**
 * Which companies the whole-market features watch (research 0003, Unusual activity).
 *
 * Which NSE symbols are funds (ETFs), not companies. NSE lists ETFs in series
 * EQ next to shares, and they behave nothing like them: a gold ETF's price
 * follows gold, and its buyers nearly always hold (research 0003, review). The
 * reliable mark is the ISIN: mutual-fund units start "INF", company shares "INE".
 * bhavcopy carries the ISIN in both formats; daily_prices doesn't store it.
 */
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "../db";

export const FUND_SYMBOLS_FILE = new URL("./fund-symbols.txt", import.meta.url);

/** Symbols in one bhavcopy whose ISIN starts "INF". Throws if the file has no ISIN column. */
export function fundSymbols(csv: string): string[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  const cols = (lines[0] ?? "").split(",").map((c) => c.trim());
  const iIsin = cols.indexOf("ISIN");
  const iSym = cols.includes("TckrSymb") ? cols.indexOf("TckrSymb") : cols.indexOf("SYMBOL");
  if (iIsin < 0 || iSym < 0) throw new Error(`bhavcopy header has no ISIN/symbol column: ${lines[0]?.slice(0, 120)}`);
  const out = new Set<string>();
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    if ((f[iIsin] ?? "").trim().startsWith("INF")) out.add((f[iSym] ?? "").trim());
  }
  return [...out].sort();
}

/** The committed list written by `bun run research:fund-symbols` (comment lines start with #). */
export function readFundSymbols(file: URL | string = FUND_SYMBOLS_FILE): Set<string> {
  return new Set(
    readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith("#")),
  );
}

/**
 * Every company with EQ prices, once, under its latest symbol: a symbol whose
 * every row predates a rename away from it is an old name, loaded through the
 * new symbol's lineage, unless the new symbol never traded in EQ (renamed and
 * moved to trade-for-trade): then the old symbol is the company's only EQ
 * history, and dropping it would quietly remove troubled companies. A ticker
 * reused after its rename has later rows and stays. `funds` (ETFs) are left out.
 */
export async function companies(funds: Set<string> = new Set()): Promise<string[]> {
  const rows = await db.execute<{ symbol: string }>(sql`
    select s.symbol from (select symbol, max(trade_date) as last from daily_prices where series = 'EQ' group by symbol) s
    where not exists (
      select 1 from symbol_changes c
      where c.old_symbol = s.symbol and s.last < c.changed_on
        and exists (select 1 from daily_prices q where q.symbol = c.new_symbol and q.series = 'EQ')
    )
    order by s.symbol`);
  return rows.map((r) => r.symbol).filter((s) => !funds.has(s));
}
