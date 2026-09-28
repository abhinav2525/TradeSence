/**
 * Forces every test run onto the throwaway database, whatever the invocation.
 *
 * Two things conspire here: `bun test <file>` bypasses package.json scripts,
 * and Bun auto-loads `.env` — which points at the dev database. So the preload
 * must *override*, not merely default, or a direct run writes to real data.
 */
const TEST_DB =
  process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/tradesence_test";

if (!/_test(\?|$)/.test(TEST_DB)) {
  throw new Error(`TEST_DATABASE_URL must name a database ending in "_test", got ${TEST_DB}`);
}

process.env.DATABASE_URL = TEST_DB;
