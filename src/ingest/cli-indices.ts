/** Loads daily closes of every NSE index for a date range. Resumable. */
import { ingestIndexDays } from "./index-prices";
import { sql } from "../db";

const start = process.argv[2];
const end = process.argv[3];
if (!start || !end) {
  console.error("usage: bun run ingest:indices <start YYYY-MM-DD> <end YYYY-MM-DD>");
  process.exit(1);
}

let done = 0;
const tally = await ingestIndexDays(start, end, {
  onDay: (day, ok) => {
    done += 1;
    if (!ok || done % 100 === 0) console.log(`[indices] ${done} days, last ${day} ${ok ? "ok" : "ERROR"}`);
  },
});
console.log(`[indices] done:`, JSON.stringify(tally));
await sql.end();
