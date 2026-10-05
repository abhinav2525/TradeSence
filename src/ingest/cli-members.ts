/**
 * Loads one index's membership since 2020 from its hand-kept file (decision 0034):
 *   bun run ingest:members bank [--force]      (bun run ingest:nifty50 = "nifty50")
 * Replaces only that index's rows, in one transaction. Refuses a file that breaks
 * the index's member counts, and one with fewer periods than are stored unless
 * --force. Manual only: the nightly job never reloads membership.
 */
import { INDICES, parseMembersArgs } from "./indices";
import { loadMembership } from "./nifty50-history";
import { sql } from "../db";

const args = parseMembersArgs(process.argv.slice(2));
if (!args) {
  console.error(`usage: bun run ingest:members <${INDICES.map((x) => x.key).join("|")}> [--force]`);
  process.exit(2);
}
const { entry, force } = args;
try {
  const n = await loadMembership(entry, { force });
  console.log(`[members] ${entry.label}: loaded ${n} membership periods from ${entry.file.pathname.split("/").at(-1)}`);
} catch (e) {
  console.error(`[members] ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
