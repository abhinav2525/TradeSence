/** Rebuilds the Top volume table. bun run volume-leaders */
import { sql } from "../db";
import { computeVolumeLeaders } from "./compute-volume-leaders";
const t0 = Date.now();
const r = await computeVolumeLeaders();
console.log(`[volume leaders] ${r.rows} rows as of ${r.asOf} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
await sql.end();
