/**
 * NSE ticker renames, so a renamed company keeps its history.
 *
 * Bhavcopy records each day under the symbol current on that day, so ETERNAL's
 * prices before 2025-04-09 sit under ZOMATO. NSE publishes every rename in one
 * small CSV; we store it and stitch the old symbol's prices on at compute time.
 * See docs/decisions/0003-renamed-symbols-lose-history.md.
 */
import { sql } from "drizzle-orm";
import { db, schema } from "../db";
import { download } from "./bhavcopy";
import { parseExDate } from "./corporate-actions";

export const SYMBOL_CHANGES_URL = "https://nsearchives.nseindia.com/content/equities/symbolchange.csv";

export type SymbolChange = {
  company: string | null;
  oldSymbol: string;
  newSymbol: string;
  changedOn: string; // ISO; first day under newSymbol
};

const SYMBOL = /^[A-Z0-9&._-]+$/i;

/**
 * Parses NSE's symbolchange.csv: no header, `company,old,new,DD-MON-YYYY`.
 *
 * Read from the right, because the company name is free text and the other
 * three fields are not. A line that doesn't fit is returned in `rejected`,
 * never guessed at.
 */
export function parseSymbolChanges(csv: string): { rows: SymbolChange[]; rejected: string[] } {
  const rows: SymbolChange[] = [];
  const rejected: string[] = [];

  for (const line of csv.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const f = line.split(",").map((x) => x.trim());
    const changedOn = f.length >= 4 ? parseExDate(f[f.length - 1]) : null;
    const newSymbol = f[f.length - 2] ?? "";
    const oldSymbol = f[f.length - 3] ?? "";
    if (!changedOn || !SYMBOL.test(oldSymbol) || !SYMBOL.test(newSymbol)) {
      rejected.push(line);
      continue;
    }
    const company = f.slice(0, -3).join(",").trim();
    rows.push({ company: company || null, oldSymbol, newSymbol, changedOn });
  }
  return { rows, rejected };
}

/** A symbol and the dates it belonged to this company: from inclusive, to exclusive. */
export type LineageEntry = { symbol: string; from: string | null; to: string | null };

/**
 * Every symbol a company has traded under, newest first, each with the dates
 * it belonged to *this* company.
 *
 * Tickers get reused: if an old symbol was itself renamed away from a different
 * company earlier, its window starts at that hand-over, so the other company's
 * prices are never mixed in. When several old symbols were renamed into the
 * same one, the most recent rename wins.
 */
export function symbolLineage(
  symbol: string,
  changes: Pick<SymbolChange, "oldSymbol" | "newSymbol" | "changedOn">[],
): LineageEntry[] {
  const out: LineageEntry[] = [];
  const seen = new Set<string>();
  let current = symbol;
  let to: string | null = null;

  while (!seen.has(current)) {
    seen.add(current);
    const before = (c: { changedOn: string }) => to === null || c.changedOn < to;
    const latest = <T extends { changedOn: string }>(xs: T[]) =>
      xs.reduce<T | undefined>((a, b) => (!a || b.changedOn > a.changedOn ? b : a), undefined);

    // How this company came to hold `current`...
    const into = latest(changes.filter((c) => c.newSymbol === current && before(c)));
    // ...and whether `current` belonged to someone else before that.
    const awayFrom = latest(changes.filter((c) => c.oldSymbol === current && before(c)));

    const from = [into?.changedOn, awayFrom?.changedOn].filter(Boolean).sort().pop() ?? null;
    out.push({ symbol: current, from, to });

    if (!into || (awayFrom && awayFrom.changedOn > into.changedOn)) break;
    to = into.changedOn;
    current = into.oldSymbol;
  }
  return out;
}

export type FetchSymbolChangesResult =
  | { status: "ok"; rows: SymbolChange[]; rejected: string[] }
  | { status: "error"; message: string };

export async function fetchSymbolChanges(
  deps: { download?: typeof download } = {},
): Promise<FetchSymbolChangesResult> {
  const get = deps.download ?? download;
  const res = await get(SYMBOL_CHANGES_URL);
  if (res.kind !== "ok") {
    return { status: "error", message: res.kind === "failed" ? res.message : "HTTP 404" };
  }
  const { rows, rejected } = parseSymbolChanges(new TextDecoder().decode(res.bytes));
  // An error page parses to nothing; that must not read as "no renames".
  if (rows.length === 0) {
    return { status: "error", message: `no readable rows (first line: ${rejected[0]?.slice(0, 80)})` };
  }
  return { status: "ok", rows, rejected };
}

/** Fetches the full list and upserts it. Idempotent. */
export async function ingestSymbolChanges(
  deps: { download?: typeof download } = {},
): Promise<{ status: "ok"; stored: number; rejected: number } | { status: "error"; message: string }> {
  const res = await fetchSymbolChanges(deps);
  if (res.status === "error") return res;

  const unique = new Map(res.rows.map((r) => [`${r.oldSymbol}|${r.newSymbol}|${r.changedOn}`, r]));
  const rows = [...unique.values()];
  for (let i = 0; i < rows.length; i += 1000) {
    await db
      .insert(schema.symbolChanges)
      .values(rows.slice(i, i + 1000))
      .onConflictDoUpdate({
        target: [schema.symbolChanges.oldSymbol, schema.symbolChanges.newSymbol, schema.symbolChanges.changedOn],
        set: { company: sql`excluded.company` },
      });
  }
  return { status: "ok", stored: rows.length, rejected: res.rejected.length };
}
