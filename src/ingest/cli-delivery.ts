/** Loads delivery figures for a date range (decision 0021). Resumable. */
import { ingestDeliveryDays } from "./delivery";
import { sql } from "../db";

const start = process.argv[2];
const end = process.argv[3];
if (!start || !end) {
  console.error("usage: bun run ingest:delivery <start YYYY-MM-DD> <end YYYY-MM-DD>");
  process.exit(1);
}

let done = 0;
const tally = await ingestDeliveryDays(start, end, {
  onDay: (day, res) => {
    done += 1;
    if (res.status === "error") console.log(`[delivery] ${day} ERROR ${res.message}`);
    else if (done % 100 === 0) console.log(`[delivery] ${done} days, last ${day} ok (${res.rows.length} rows)`);
  },
});
console.log(`[delivery] done:`, JSON.stringify(tally));
await sql.end();
