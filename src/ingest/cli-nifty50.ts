import { seedNifty50 } from "./nifty50";
import { sql } from "../db";

const addedOn = process.argv[2] ?? "2016-01-01";
const n = await seedNifty50(addedOn);
console.log(`[nifty50] seeded ${n} members with added_on=${addedOn}`);
await sql.end();
