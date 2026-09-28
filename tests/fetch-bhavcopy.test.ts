import { test, expect, describe } from "bun:test";
import { fetchBhavcopy } from "../src/ingest/bhavcopy";

// These hit the live NSE archive. It is public, unauthenticated and the thing
// most likely to break, so mocking it would only prove our mock works.
describe("fetchBhavcopy", () => {
  test("downloads and parses a modern trading day (udiff)", async () => {
    const res = await fetchBhavcopy("2026-09-25");
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.format).toBe("udiff");
    expect(res.rows.length).toBeGreaterThan(1000);
    const reliance = res.rows.find((r) => r.symbol === "RELIANCE" && r.series === "EQ");
    expect(reliance).toBeDefined();
    expect(reliance!.tradeDate).toBe("2026-09-25");
    expect(reliance!.close).toBeGreaterThan(0);
  }, 30000);

  test("downloads and parses an older trading day (legacy)", async () => {
    const res = await fetchBhavcopy("2023-01-02");
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.format).toBe("legacy");
    expect(res.rows.length).toBeGreaterThan(1000);
    const reliance = res.rows.find((r) => r.symbol === "RELIANCE" && r.series === "EQ");
    expect(reliance!.tradeDate).toBe("2023-01-02");
    expect(reliance!.close).toBeCloseTo(2575.9, 1);
  }, 30000);

  test("reports a holiday rather than writing an error page", async () => {
    const res = await fetchBhavcopy("2026-09-20"); // a Sunday
    expect(res.status).toBe("holiday");
  }, 30000);
});
