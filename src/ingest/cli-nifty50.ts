/** Loads NIFTY 50 membership since 2020 from nifty50-history.csv. */
import { loadNifty50History } from "./nifty50-history";
import { sql } from "../db";

const n = await loadNifty50History();
console.log(`[nifty50] loaded ${n} membership periods from nifty50-history.csv`);
await sql.end();
