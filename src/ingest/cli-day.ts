import { ingestDay } from "./ingest-day";
import { sql } from "../db";

const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const result = await ingestDay(date, { force: process.argv.includes("--force") });
console.log(`[ingest] ${date}:`, JSON.stringify(result));
await sql.end();
