/**
 * Nightly checks on the hand-kept membership files (decision 0034), as warning
 * lines; an empty list means all is well. Two questions per registered index:
 *
 * 1. Has NSE changed the index? Compares the file's members today with NSE's live
 *    list, which the nightly already downloads into `index_constituents` (so this
 *    runs after that step and makes no request of its own). A list not refreshed
 *    today is reported as unchecked, never compared stale.
 * 2. Was the file edited but not loaded? Compares the file's rows with
 *    `index_members`. Loading stays a manual command, so deletes stay human-started.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { INDICES, type IndexEntry } from "./indices";
import { membershipDrift, readMembershipHistory } from "./nifty50-history";

const fileName = (e: IndexEntry) => e.file.pathname.split("/").at(-1)!;
const rowKey = (symbol: string, addedOn: string, removedOn: string | null) => `${symbol}|${addedOn}|${removedOn ?? ""}`;

export async function membershipWarnings(today: string, entries: readonly IndexEntry[] = INDICES): Promise<string[]> {
  const out: string[] = [];
  for (const e of entries) {
    let rows;
    try {
      rows = readMembershipHistory(e);
    } catch (err) {
      out.push(`could not read src/ingest/${fileName(e)}: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    const list = await db.select().from(schema.indexConstituents).where(eq(schema.indexConstituents.indexKey, e.list));
    if (list.length === 0 || list.some((r) => r.fetchedOn !== today)) {
      out.push(`could not check ${e.label} against NSE: its member list was not refreshed today`);
    } else {
      const drift = membershipDrift(rows, list.map((r) => r.symbol), today);
      if (drift.added.length || drift.removed.length) {
        out.push(
          `${e.label} changed: NSE added ${drift.added.join(", ") || "none"}, removed ${drift.removed.join(", ") || "none"}. ` +
            `Update src/ingest/${fileName(e)} (see docs/decisions/0005 and 0034) and run bun run ingest:members ${e.key}.`,
        );
      }
    }

    const stored = await db.select().from(schema.indexMembers).where(eq(schema.indexMembers.indexName, e.members));
    const inFile = new Set(rows.map((r) => rowKey(r.symbol, r.addedOn, r.removedOn)));
    const inDb = new Set(stored.map((r) => rowKey(r.symbol, r.addedOn, r.removedOn)));
    const notStored = [...inFile].filter((k) => !inDb.has(k)).length;
    const notInFile = [...inDb].filter((k) => !inFile.has(k)).length;
    if (notStored || notInFile) {
      out.push(
        `src/ingest/${fileName(e)} differs from the database (${notStored} period(s) not loaded, ${notInFile} stored but not in the file): ` +
          `run bun run ingest:members ${e.key}.`,
      );
    }
  }
  return out;
}
