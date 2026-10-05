import { test, expect, describe } from "bun:test";
import { ingestWarning } from "../src/ingest/nightly-lines";

describe("ingestWarning", () => {
  test("an error day says which day, why, and that it is retried", () => {
    const line = ingestWarning({ date: "2026-10-05", result: { status: "error", message: "udiff: TypeError: fetch failed" }, done: 5, total: 8 });
    expect(line).toBe("[nightly] WARNING 2026-10-05 not loaded: udiff: TypeError: fetch failed (retried at the 20:15 run and tomorrow)");
  });
  test("ok, holiday and skipped days produce no warning", () => {
    expect(ingestWarning({ date: "2026-10-05", result: { status: "ok", rowCount: 2913, format: "udiff" }, done: 1, total: 1 })).toBeNull();
    expect(ingestWarning({ date: "2026-10-04", result: { status: "holiday" }, done: 1, total: 1 })).toBeNull();
    expect(ingestWarning({ date: "2026-10-01", result: { status: "skipped" }, done: 1, total: 1 })).toBeNull();
  });
});
