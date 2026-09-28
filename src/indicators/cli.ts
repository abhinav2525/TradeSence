import { computeIndicators } from "./compute";
import { sql } from "../db";

const n = await computeIndicators();
console.log(`[indicators] wrote ${n} rows`);
await sql.end();
