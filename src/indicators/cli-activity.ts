/** Rebuilds the Unusual activity table. bun run activity */
import { sql } from "../db";
import { computeUnusualDays } from "./compute-activity";

const t0 = Date.now();
const r = await computeUnusualDays();
console.log(`[activity] ${r.rows} unusual stock-days from ${r.companies} companies in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
await sql.end();
