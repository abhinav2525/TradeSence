/**
 * Loads NSE corporate actions for a date range, one calendar year per request.
 * Idempotent, so an interrupted run is resumed by running it again.
 */
import { ingestCorporateActions } from "./corporate-actions";
import { sql } from "../db";

const start = process.argv[2];
const end = process.argv[3];
if (!start || !end) {
  console.error("usage: bun run ingest:corporate-actions <start YYYY-MM-DD> <end YYYY-MM-DD>");
  process.exit(1);
}

let failed = false;
for (let year = Number(start.slice(0, 4)); year <= Number(end.slice(0, 4)); year++) {
  const from = year === Number(start.slice(0, 4)) ? start : `${year}-01-01`;
  const to = year === Number(end.slice(0, 4)) ? end : `${year}-12-31`;
  const res = await ingestCorporateActions(from, to);
  console.log(`[corporate-actions] ${from}..${to}:`, JSON.stringify(res));
  if (res.status === "error") failed = true;
  await new Promise((r) => setTimeout(r, 1000));
}

await sql.end();
if (failed) process.exit(1);
