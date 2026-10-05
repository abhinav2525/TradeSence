/**
 * Point-in-time index membership since 2020, from small hand-checked files.
 *
 * Each registered index (`indices.ts`: the NIFTY 50, Nifty Bank) has a file next
 * to this module that is the source of truth: one row per period a stock was in
 * the index, each traced to an NSE Indices press release. NSE publishes no
 * machine-readable history, and the changes are few, so a reviewed file beats a
 * scraper. See docs/decisions/0005-point-in-time-membership.md and 0034.
 */
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { NIFTY50, sizeOn, type IndexEntry, type SizeStep } from "./indices";

/** Breadth before this date is not shown: membership is only known from here. */
export const HISTORY_START = "2020-01-01";

const HEADER = "symbol,added_on,removed_on,listed_as,source";

export type MembershipRow = {
  symbol: string; // today's NSE symbol; history is joined through renames
  addedOn: string; // first day in the index
  removedOn: string | null; // first day out of the index; null = still a member
  listedAs: string | null; // the symbol it had when added, if different
  source: string;
};

function isoDate(raw: string, line: string, label: string): string {
  const d = new Date(`${raw}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) {
    throw new Error(`Bad date "${raw}" in ${label} history: ${line}`);
  }
  return raw;
}

/**
 * Parses the history file. Throws on anything doubtful rather than skipping
 * it: a silently dropped row would make the index 49 stocks for years.
 */
export function parseMembershipHistory(text: string, label: string = NIFTY50.label): MembershipRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "" && !l.startsWith("#"));
  if (lines[0]?.trim() !== HEADER) {
    throw new Error(`${label} history must start with the header "${HEADER}", got: ${lines[0]}`);
  }
  return lines.slice(1).map((line) => {
    const [symbol = "", added = "", removed = "", listedAs = "", ...source] = line.split(",").map((f) => f.trim());
    if (!symbol) throw new Error(`Missing symbol in ${label} history: ${line}`);
    const addedOn = isoDate(added, line, label);
    const removedOn = removed ? isoDate(removed, line, label) : null;
    if (removedOn && removedOn <= addedOn) {
      throw new Error(`removed_on must be after added_on in ${label} history: ${line}`);
    }
    return { symbol, addedOn, removedOn, listedAs: listedAs || null, source: source.join(",") };
  });
}

/** An index's committed file (the NIFTY 50's by default). */
export function readMembershipHistory(entry: IndexEntry = NIFTY50): MembershipRow[] {
  return parseMembershipHistory(readFileSync(entry.file, "utf8"), entry.label);
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
 * days, and on each day the expected size changes, checks every day. `size` is
 * a fixed count or a dated schedule (`IndexEntry.sizes`); a fixed count applies
 * from HISTORY_START.
 */
export function validateMembershipHistory(rows: MembershipRow[], size: number | readonly SizeStep[]): string[] {
  const sizes = typeof size === "number" ? [{ from: HISTORY_START, n: size }] : size;
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

  const start = sizes[0]?.from ?? HISTORY_START;
  const days = [...new Set([
    ...rows.flatMap((r) => [r.addedOn, r.removedOn ?? []].flat()),
    ...sizes.map((s) => s.from),
  ])].filter((d) => d >= start).sort();
  for (const day of days) {
    const n = membersOn(rows, day).length;
    const want = sizeOn(sizes, day);
    if (n !== want) problems.push(`${day}: ${n} members, expected ${want}`);
  }
  return problems;
}

/**
 * Replaces one index's membership with its file, in one transaction so the
 * dashboard never sees a half-empty index. The entry binds the file, the stored
 * name and the expected sizes, so a file can only ever load under its own name;
 * other indices' rows are never touched. Refuses (storing nothing) a history
 * that breaks the size schedule on any day, and a reload that would store fewer
 * rows than are there now unless `force` (history only grows; a shorter file is
 * far more likely a slip than a correction). Manual only: never run nightly.
 */
export async function loadMembership(
  entry: IndexEntry,
  opts: { text?: string; force?: boolean } = {},
): Promise<number> {
  const rows = opts.text === undefined ? readMembershipHistory(entry) : parseMembershipHistory(opts.text, entry.label);
  const problems = validateMembershipHistory(rows, entry.sizes);
  if (problems.length > 0) {
    throw new Error(`${entry.label} history breaks its member counts: ${problems.slice(0, 5).join("; ")}`);
  }

  await db.transaction(async (tx) => {
    const stored = (await tx.select({ s: schema.indexMembers.symbol }).from(schema.indexMembers)
      .where(eq(schema.indexMembers.indexName, entry.members))).length;
    if (rows.length < stored && !opts.force) {
      throw new Error(
        `${entry.label}: the file has ${rows.length} periods but ${stored} are stored; ` +
          `refusing to store fewer without --force`,
      );
    }
    await tx.delete(schema.indexMembers).where(eq(schema.indexMembers.indexName, entry.members));
    await tx.insert(schema.indexMembers).values(
      rows.map((r) => ({ indexName: entry.members, symbol: r.symbol, addedOn: r.addedOn, removedOn: r.removedOn })),
    );
  });
  return rows.length;
}

/** The NIFTY 50's file (kept for existing callers and tests). */
export async function loadNifty50History(text?: string): Promise<number> {
  return loadMembership(NIFTY50, { text });
}
