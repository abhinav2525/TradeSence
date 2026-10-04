/** Updates breadth_daily (whole market + NSE index lists). bun run breadth */
import { sql } from "../db";
import { computeBreadth } from "./compute-breadth";
const t0 = Date.now();
const r = await computeBreadth();
console.log(`[breadth] whole market ${r.marketDays} days, ${r.lists} index lists, as of ${r.asOf} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
await sql.end();
