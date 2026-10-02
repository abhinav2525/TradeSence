/**
 * Point-in-time NIFTY 50 membership since 2020, from a small hand-checked file.
 *
 * The file (`nifty50-history.csv`, next to this module) is the source of truth:
 * one row per period a stock was in the index, each traced to an NSE Indices
 * press release. NSE publishes no machine-readable history, and the changes are
 * few (12 events since 2020), so a reviewed file beats a scraper. See
 * docs/decisions/0005-point-in-time-membership.md.
 */
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { INDEX_NAME } from "./nifty50";

/** Breadth before this date is not shown: membership is only known from here. */
export const HISTORY_START = "2020-01-01";

const HISTORY_FILE = new URL("./nifty50-history.csv", import.meta.url);
const HEADER = "symbol,added_on,removed_on,listed_as,source";

export type MembershipRow = {
  symbol: string; // today's NSE symbol; history is joined through renames
  addedOn: string; // first day in the index
  removedOn: string | null; // first day out of the index; null = still a member
  listedAs: string | null; // the symbol it had when added, if different
  source: string;
};

function isoDate(raw: string, line: string): string {
  const d = new Date(`${raw}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) {
    throw new Error(`Bad date "${raw}" in NIFTY 50 history: ${line}`);
  }
  return raw;
}

/**
 * Parses the history file. Throws on anything doubtful rather than skipping
 * it: a silently dropped row would make the index 49 stocks for years.
 */
export function parseMembershipHistory(text: string): MembershipRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "" && !l.startsWith("#"));
  if (lines[0]?.trim() !== HEADER) {
    throw new Error(`NIFTY 50 history must start with the header "${HEADER}", got: ${lines[0]}`);
  }
  return lines.slice(1).map((line) => {
    const [symbol = "", added = "", removed = "", listedAs = "", ...source] = line.split(",").map((f) => f.trim());
    if (!symbol) throw new Error(`Missing symbol in NIFTY 50 history: ${line}`);
    const addedOn = isoDate(added, line);
    const removedOn = removed ? isoDate(removed, line) : null;
    if (removedOn && removedOn <= addedOn) {
      throw new Error(`removed_on must be after added_on in NIFTY 50 history: ${line}`);
    }
    return { symbol, addedOn, removedOn, listedAs: listedAs || null, source: source.join(",") };
  });
}

export function readMembershipHistory(): MembershipRow[] {
  return parseMembershipHistory(readFileSync(HISTORY_FILE, "utf8"));
}

/** Members on a date: added on or before it, and not yet removed. */
export function membersOn(rows: MembershipRow[], dateIso: string): string[] {
  return rows
    .filter((r) => r.addedOn <= dateIso && (r.removedOn === null || dateIso < r.removedOn))
    .map((r) => r.symbol);
}

/**
 * How NSE's published list differs from the file on a date. Non-empty means
 * NSE has changed the index and the file needs a row: the nightly job warns.
 */
export function membershipDrift(
  rows: MembershipRow[],
  live: string[],
  dateIso: string,
): { added: string[]; removed: string[] } {
  const ours = new Set(membersOn(rows, dateIso));
  const theirs = new Set(live);
  return {
    added: [...theirs].filter((s) => !ours.has(s)).sort(),
    removed: [...ours].filter((s) => !theirs.has(s)).sort(),
  };
}

/**
 * Everything wrong with a history, as readable lines. Membership only changes
 * on a row's added or removed date, so checking the count on each of those
 * days checks every day.
 */
export function validateMembershipHistory(rows: MembershipRow[], size: number): string[] {
  const problems: string[] = [];

  const bySymbol = new Map<string, MembershipRow[]>();
  for (const r of rows) bySymbol.set(r.symbol, [...(bySymbol.get(r.symbol) ?? []), r]);
  for (const [symbol, periods] of bySymbol) {
    const sorted = [...periods].sort((a, b) => (a.addedOn < b.addedOn ? -1 : 1));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      if (prev.removedOn === null || prev.removedOn > sorted[i]!.addedOn) {
        problems.push(`${symbol}: overlapping periods`);
      }
    }
  }

  const days = [...new Set(rows.flatMap((r) => [r.addedOn, r.removedOn ?? []].flat()))].sort();
  for (const day of days) {
    const n = membersOn(rows, day).length;
    if (n !== size) problems.push(`${day}: ${n} members`);
  }
  return problems;
}

/**
 * Replaces NIFTY 50 membership with the history file, in one transaction so
 * the dashboard never sees a half-empty index. Refuses a history that isn't
 * exactly 50 members on every day.
 */
export async function loadNifty50History(text?: string): Promise<number> {
  const rows = text === undefined ? readMembershipHistory() : parseMembershipHistory(text);
  const problems = validateMembershipHistory(rows, 50);
  if (problems.length > 0) {
    throw new Error(`NIFTY 50 history is not 50 members throughout: ${problems.slice(0, 5).join("; ")}`);
  }

  await db.transaction(async (tx) => {
    await tx.delete(schema.indexMembers).where(eq(schema.indexMembers.indexName, INDEX_NAME));
    await tx.insert(schema.indexMembers).values(
      rows.map((r) => ({ indexName: INDEX_NAME, symbol: r.symbol, addedOn: r.addedOn, removedOn: r.removedOn })),
    );
  });
  return rows.length;
}
