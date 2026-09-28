import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { resolveDatabaseUrl } from "./url";

const url = resolveDatabaseUrl();

export const sql = postgres(url, { max: 8 });
export const db = drizzle(sql, { schema });
export { schema };
