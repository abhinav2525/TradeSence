/** Loads NSE's full list of ticker renames (one small CSV). Idempotent. */
import { ingestSymbolChanges } from "./symbol-changes";
import { sql } from "../db";

const res = await ingestSymbolChanges();
console.log(`[symbol-changes]`, JSON.stringify(res));
await sql.end();
if (res.status === "error") process.exit(1);
