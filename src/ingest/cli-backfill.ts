import { backfill } from "./backfill";
import { sql } from "../db";

const start = process.argv[2];
const end = process.argv[3];
if (!start || !end) {
  console.error("usage: bun run ingest:backfill <start YYYY-MM-DD> <end YYYY-MM-DD>");
  process.exit(1);
}

const t0 = Date.now();
const tally = await backfill(start, end, {
  delayMs: Number(process.env.INGEST_DELAY_MS ?? 700),
  onProgress: ({ date, result, done, total }) => {
    if (done % 25 === 0 || result.status === "ok") {
      const mins = ((Date.now() - t0) / 60000).toFixed(1);
      console.log(`[${done}/${total}] ${date} ${result.status} (${mins}m elapsed)`);
    }
  },
});
console.log(`[backfill] done:`, JSON.stringify(tally));
await sql.end();
