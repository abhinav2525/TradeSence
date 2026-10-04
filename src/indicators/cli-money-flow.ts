/** Rebuilds the Money flow table. bun run money-flow */
import { sql } from "../db";
import { computeMoneyFlow } from "./compute-money-flow";
const t0 = Date.now();
const r = await computeMoneyFlow();
console.log(`[money flow] ${r.rows} rows as of ${r.asOf} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
await sql.end();
