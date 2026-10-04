/**
 * Which NSE symbols are funds (ETFs), not companies. NSE lists ETFs in series
 * EQ next to shares, and they behave nothing like them: a gold ETF's price
 * follows gold, and its buyers nearly always hold (research 0003, review). The
 * reliable mark is the ISIN: mutual-fund units start "INF", company shares "INE".
 * bhavcopy carries the ISIN in both formats; daily_prices doesn't store it.
 */
import { readFileSync } from "node:fs";

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
