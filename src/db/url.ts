export const DEFAULT_DATABASE_URL = "postgres://localhost:5432/tradesence";

const TEST_DB_PATTERN = /_test(\?|$)/;

/**
 * Resolves the database URL, refusing to hand a non-test database to a test run.
 *
 * This guard lives here, at the connection point, rather than in the test
 * preload — because `bun test` resolves `bunfig.toml` from the *current working
 * directory*. Run from a subdirectory, the preload never executes and `.env` is
 * never loaded, so the fallback below would have pointed the suite at the dev
 * database, whose first act is `db.delete(dailyPrices)`. `NODE_ENV=test` is set
 * by the test runner from any directory, so checking it here cannot be bypassed.
 */
export function resolveDatabaseUrl(
  env: { DATABASE_URL?: string; NODE_ENV?: string } = process.env,
): string {
  const url = env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

  if (env.NODE_ENV === "test" && !TEST_DB_PATTERN.test(url)) {
    throw new Error(
      `Refusing to run tests against ${url} — the database name must end in "_test". ` +
        `Run tests from the repository root, or set DATABASE_URL to a test database.`,
    );
  }
  return url;
}
