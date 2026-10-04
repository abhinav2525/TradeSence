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
import { db, schema } from "../db";
import { bhavcopyUrl, download, unzipCsv } from "../ingest/bhavcopy";

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

/**
 * Adds the session's fund symbols (ISIN "INF…") to `fund_symbols`, from that
 * day's bhavcopy. A failed download or unreadable file is an error, never
 * "no new funds"; the next night tries again.
 */
export async function refreshFundSymbols(
  dateIso: string,
  deps: { download?: typeof download } = {},
): Promise<{ status: "ok"; added: number } | { status: "error"; message: string }> {
  const res = await (deps.download ?? download)(bhavcopyUrl(dateIso).url);
  if (res.kind !== "ok") return { status: "error", message: res.kind === "failed" ? res.message : "HTTP 404" };
  let found: string[];
  try {
    found = fundSymbols(unzipCsv(res.bytes));
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
  if (found.length === 0) return { status: "ok", added: 0 };
  const added = await db.insert(schema.fundSymbols).values(found.map((symbol) => ({ symbol, firstSeen: dateIso })))
    .onConflictDoNothing().returning({ symbol: schema.fundSymbols.symbol });
  return { status: "ok", added: added.length };
}

/** The committed list plus every fund seen since. */
export async function allFundSymbols(): Promise<Set<string>> {
  const rows = await db.select({ symbol: schema.fundSymbols.symbol }).from(schema.fundSymbols);
  return new Set([...readFundSymbols(), ...rows.map((r) => r.symbol)]);
}
