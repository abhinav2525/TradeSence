import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "postgres://localhost:5432/tradesence";

export const sql = postgres(url, { max: 8 });
export const db = drizzle(sql, { schema });
export { schema };
