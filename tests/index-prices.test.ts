import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { parseIndexClose, ingestIndexDays, fetchIndexDay } from "../src/ingest/index-prices";

// Copied from NSE's ind_close_all_02012020.csv.
const HEADER =
  "Index Name,Index Date,Open Index Value,High Index Value,Low Index Value,Closing Index Value," +
  "Points Change,Change(%),Volume,Turnover (Rs. Cr.),P/E,P/B,Div Yield";
const FILE = [
  HEADER,
  "Nifty 50,02-01-2020,12198.55,12289.9,12195.25,12282.2,99.7,.82,407697594,15256.55,28.56,3.79,1.23",
  "Nifty Next 50,02-01-2020,28325.45,28552.8,28314.55,28535.4,242.05,.86,229906379,4109.02,65.96,3.89,1.14",
].join("\r\n");

const bytes = (s: string) => new TextEncoder().encode(s);

describe("parseIndexClose", () => {
  test("reads every index with its open, high, low and close", () => {
    expect(parseIndexClose(FILE, "2020-01-02")).toEqual([
      { tradeDate: "2020-01-02", indexName: "Nifty 50", open: 12198.55, high: 12289.9, low: 12195.25, close: 12282.2 },
      { tradeDate: "2020-01-02", indexName: "Nifty Next 50", open: 28325.45, high: 28552.8, low: 28314.55, close: 28535.4 },
    ]);
  });

  test("refuses a file whose header has lost a column it reads", () => {
    expect(() => parseIndexClose(FILE.replace("Closing Index Value", "Close"), "2020-01-02")).toThrow(/header/);
  });

  test("refuses a file for a different day than the one asked for", () => {
    expect(() => parseIndexClose(FILE, "2020-01-03")).toThrow(/date/);
  });

  // ind_close_all_06042023.csv (and 10th, 11th April 2023) write the date
  // month-first. The prices are right; only the date order is.
  test("accepts NSE's occasional month-first date for the requested day", () => {
    const file = HEADER + "\nNifty 50,04-06-2023,17533.85,17638.7,17502.85,17599.15,42.1,0.24,1,1,1,1,1";
    expect(parseIndexClose(file, "2023-04-06")[0]).toMatchObject({ tradeDate: "2023-04-06", close: 17599.15 });
    expect(() => parseIndexClose(file, "2023-04-05")).toThrow(/date/);
  });

  test("drops a row with no usable close instead of storing zero", () => {
    const rows = parseIndexClose(FILE + "\r\nNifty Odd,02-01-2020,-,-,-,-,-,-,-,-,-,-,-", "2020-01-02");
    expect(rows.map((r) => r.indexName)).toEqual(["Nifty 50", "Nifty Next 50"]);
  });
});

describe("fetchIndexDay", () => {
  test("downloads a real day from NSE's archive", async () => {
    const res = await fetchIndexDay("2020-01-02");
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.rows.find((r) => r.indexName === "Nifty 50")?.close).toBe(12282.2);
  }, 30000);

  test("an HTML error page is an error, not an empty day", async () => {
    const res = await fetchIndexDay("2020-01-02", {
      download: async () => ({ kind: "ok", bytes: bytes("<html>blocked</html>") }),
    });
    expect(res.status).toBe("error");
  });
});

describe("ingestIndexDays", () => {
  beforeEach(async () => {
    await db.delete(schema.indexPrices);
    await db.delete(schema.ingestLog);
  });

  test("fetches only trading days not yet stored, and is idempotent", async () => {
    await db.insert(schema.ingestLog).values([
      { tradeDate: "2020-01-02", source: "bhavcopy", status: "ok", format: "legacy", rowCount: 1 },
      { tradeDate: "2020-01-04", source: "bhavcopy", status: "holiday", format: null, rowCount: null },
    ]);
    const asked: string[] = [];
    const download = async (url: string) => {
      asked.push(url);
      return { kind: "ok" as const, bytes: bytes(FILE) };
    };

    expect(await ingestIndexDays("2020-01-01", "2020-01-31", { download, delayMs: 0 }))
      .toEqual({ ok: 1, error: 0 });
    expect(asked).toEqual(["https://nsearchives.nseindia.com/content/indices/ind_close_all_02012020.csv"]);

    await ingestIndexDays("2020-01-01", "2020-01-31", { download, delayMs: 0 });
    expect(asked).toHaveLength(1); // already stored: no second download
    expect(await db.select().from(schema.indexPrices)).toHaveLength(2);
  });

  test("a failed day is counted, stored nothing, and is retried next time", async () => {
    await db.insert(schema.ingestLog).values(
      { tradeDate: "2020-01-02", source: "bhavcopy", status: "ok", format: "legacy", rowCount: 1 },
    );
    const failing = async () => ({ kind: "failed" as const, message: "timeout" });
    expect(await ingestIndexDays("2020-01-01", "2020-01-31", { download: failing, delayMs: 0 }))
      .toEqual({ ok: 0, error: 1 });
    expect(await db.select().from(schema.indexPrices)).toHaveLength(0);
  });
});
