import { test, expect, describe } from "bun:test";
import { resolveDatabaseUrl, DEFAULT_DATABASE_URL } from "../src/db/url";

describe("resolveDatabaseUrl", () => {
  test("uses DATABASE_URL when set outside tests", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: "postgres://h/app" })).toBe("postgres://h/app");
  });

  test("falls back to the dev default outside tests", () => {
    expect(resolveDatabaseUrl({})).toBe(DEFAULT_DATABASE_URL);
  });

  test("allows a _test database under NODE_ENV=test", () => {
    const url = "postgres://localhost:5432/tradesence_test";
    expect(resolveDatabaseUrl({ NODE_ENV: "test", DATABASE_URL: url })).toBe(url);
  });

  // The actual C2 failure: bun test from a subdirectory finds no bunfig.toml,
  // so the preload never runs and DATABASE_URL is unset — and the suite's
  // db.delete() calls would then wipe the dev database.
  test("refuses the dev database under NODE_ENV=test", () => {
    expect(() => resolveDatabaseUrl({ NODE_ENV: "test", DATABASE_URL: DEFAULT_DATABASE_URL }))
      .toThrow(/refus/i);
  });

  test("refuses an unset DATABASE_URL under NODE_ENV=test", () => {
    expect(() => resolveDatabaseUrl({ NODE_ENV: "test" })).toThrow(/refus/i);
  });

  test("accepts a _test database with query parameters", () => {
    const url = "postgres://localhost:5432/tradesence_test?sslmode=disable";
    expect(resolveDatabaseUrl({ NODE_ENV: "test", DATABASE_URL: url })).toBe(url);
  });
});
