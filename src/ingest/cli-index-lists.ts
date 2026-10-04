/** Refreshes today's NSE index member lists. bun run ingest:index-lists */
import { sql } from "../db";
import { ingestIndexLists } from "./index-constituents";

const r = await ingestIndexLists();
console.log(`[index lists] ${r.ok} loaded${r.failed.length ? `, failed: ${r.failed.join(", ")}` : ""}`);
for (const p of r.sizeProblems) console.warn(`[index lists] WARNING ${p}`);
await sql.end();
