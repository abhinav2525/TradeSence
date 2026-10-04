import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { parseDelivery, fetchDeliveryDay, ingestDeliveryDays } from "../src/ingest/delivery";

// Copied from NSE's MTO_01102026.DAT. The column header names six fields but
// every row has seven: the series sits, unnamed, after the symbol. Line 2 is
// NSE's summary record: date, total delivered shares, number of rows.
const HEADER = "Record Type,Sr No,Name of Security,Quantity Traded," +
  "Deliverable Quantity(gross across client level),% of Deliverable Quantity to Traded Quantity";
const ROWS = [
  "20,1,1003IIFL29,NC,201,201,100.00",
  "20,1521,INFY,EQ,15166446,7881166,51.96",
  "20,2539,RELIANCE,EQ,16771221,10270423,61.24",
];

/** Builds a file with a correct summary record unless one is given. */
function mto(rows: string[], opts: { summary?: string; dateLine?: string } = {}) {
  const delivered = rows.reduce((s, r) => s + Number(r.split(",")[5]), 0);
  return [
    "Security Wise Delivery Position - Compulsory Rolling Settlement",
    opts.summary ?? `10,MTO,01102026,${delivered},${String(rows.length).padStart(7, "0")}`,
    opts.dateLine ?? "Trade Date <01-OCT-2026>,Settlement Type <N>",
    HEADER,
    ...rows,
  ].join("\r\n");
}
const FILE = mto(ROWS);

const bytes = (s: string) => new TextEncoder().encode(s);

describe("parseDelivery", () => {
  test("reads each stock's traded and delivered shares, keeping only the series daily_prices keeps", () => {
    expect(parseDelivery(FILE, "2026-10-01")).toEqual([
      { tradeDate: "2026-10-01", symbol: "INFY", series: "EQ", tradedQty: 15166446, deliverableQty: 7881166 },
      { tradeDate: "2026-10-01", symbol: "RELIANCE", series: "EQ", tradedQty: 16771221, deliverableQty: 10270423 },
    ]);
  });

  // MTO_30032017.DAT says "rade Date <30-MAR-2017>": the date is read from
  // the summary record, not the human-readable line.
  test("reads the date from the summary record, so a typo in the date line doesn't matter", () => {
    const typo = mto(ROWS, { dateLine: "rade Date <01-OCT-2026>,Settlement Type <N>" });
    expect(parseDelivery(typo, "2026-10-01")).toHaveLength(2);
  });

  test("refuses a file cut short (fewer rows than the summary record counts)", () => {
    const cut = mto(ROWS, { summary: "10,MTO,01102026,18151790,0000004" });
    expect(() => parseDelivery(cut, "2026-10-01")).toThrow(/rows/);
  });

  test("refuses a file whose delivered shares don't add up to the summary total", () => {
    const off = mto(ROWS, { summary: "10,MTO,01102026,18151791,0000003" });
    expect(() => parseDelivery(off, "2026-10-01")).toThrow(/total/);
  });

  // MTO_12102018.DAT: NSE's summary left out one row in series X2 (count off
  // by 1, total off by exactly its 191,918 delivered shares). A series we
  // don't store can't hide a problem in one we do.
  test("accepts a summary that leaves out exactly one row of a series we don't keep", () => {
    const x2 = "20,641,IBVENTURES,X2,199638,191918,96.13";
    const file = mto([...ROWS, x2], { summary: "10,MTO,01102026,18151790,0000003" });
    expect(parseDelivery(file, "2026-10-01").map((r) => r.symbol)).toEqual(["INFY", "RELIANCE"]);
  });

  test("still refuses when the one missing row is in a series we keep", () => {
    const tcs = "20,9,TCS,EQ,1000,500,50.00";
    const file = mto([...ROWS, tcs], { summary: "10,MTO,01102026,18151790,0000003" });
    expect(() => parseDelivery(file, "2026-10-01")).toThrow(/rows/);
  });

  test("refuses a file with no summary record", () => {
    expect(() => parseDelivery(FILE.replace(/^10,MTO.*$/m, ""), "2026-10-01")).toThrow(/summary/);
  });

  test("refuses a file for a different day than the one asked for", () => {
    expect(() => parseDelivery(FILE, "2026-10-02")).toThrow(/date/);
  });

  test("refuses a file whose header has lost a column it reads", () => {
    expect(() => parseDelivery(FILE.replace("Deliverable Quantity", "Deliv Qty"), "2026-10-01")).toThrow(/header/);
  });

  test("refuses a row it cannot read rather than storing a zero", () => {
    expect(() => parseDelivery(mto([...ROWS, "20,9,TCS,EQ,-,5,"]), "2026-10-01")).toThrow(/TCS/);
  });

  test("refuses more shares delivered than traded", () => {
    expect(() => parseDelivery(mto([...ROWS, "20,9,TCS,EQ,100,101,101.00"]), "2026-10-01")).toThrow(/TCS/);
  });

  test("keeps one row when NSE repeats a stock", () => {
    const rows = parseDelivery(mto([...ROWS, "20,1521,INFY,EQ,15166446,7881166,51.96"]), "2026-10-01");
    expect(rows.filter((r) => r.symbol === "INFY")).toHaveLength(1);
  });
});

describe("fetchDeliveryDay", () => {
  test("downloads a real day from NSE's archive, matching bhavcopy's volume", async () => {
    const res = await fetchDeliveryDay("2016-09-28");
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    // 20MICRONS traded 174,582 shares that day in bhavcopy too.
    expect(res.rows.find((r) => r.symbol === "20MICRONS")).toMatchObject({ tradedQty: 174582, deliverableQty: 150359 });
  }, 30000);

  test("an HTML error page is an error, not an empty day", async () => {
    const res = await fetchDeliveryDay("2026-10-01", {
      download: async () => ({ kind: "ok", bytes: bytes("<html>blocked</html>") }),
    });
    expect(res.status).toBe("error");
  });

  test("a 404 on a trading day is an error (not published yet), never a holiday", async () => {
    const res = await fetchDeliveryDay("2026-10-01", { download: async () => ({ kind: "notfound" }) });
    expect(res.status).toBe("error");
  });
});

describe("ingestDeliveryDays", () => {
  beforeEach(async () => {
    await db.delete(schema.dailyDelivery);
    await db.delete(schema.ingestLog);
  });

  test("fetches only trading days not yet stored, and is idempotent", async () => {
    await db.insert(schema.ingestLog).values([
      { tradeDate: "2026-10-01", source: "bhavcopy", status: "ok", format: "udiff", rowCount: 1 },
      { tradeDate: "2026-10-02", source: "bhavcopy", status: "holiday", format: null, rowCount: null },
    ]);
    const asked: string[] = [];
    const download = async (url: string) => {
      asked.push(url);
      return { kind: "ok" as const, bytes: bytes(FILE) };
    };

    expect(await ingestDeliveryDays("2026-09-30", "2026-10-03", { download, delayMs: 0 }))
      .toEqual({ ok: 1, error: 0 });
    expect(asked).toEqual(["https://nsearchives.nseindia.com/archives/equities/mto/MTO_01102026.DAT"]);

    await ingestDeliveryDays("2026-09-30", "2026-10-03", { download, delayMs: 0 });
    expect(asked).toHaveLength(1); // already stored: no second download
    expect(await db.select().from(schema.dailyDelivery)).toHaveLength(2);
  });

  test("a failed day is counted, stores nothing, and is retried next time", async () => {
    await db.insert(schema.ingestLog).values(
      { tradeDate: "2026-10-01", source: "bhavcopy", status: "ok", format: "udiff", rowCount: 1 },
    );
    const failing = async () => ({ kind: "failed" as const, message: "timeout" });
    expect(await ingestDeliveryDays("2026-09-30", "2026-10-03", { download: failing, delayMs: 0 }))
      .toEqual({ ok: 0, error: 1 });
    expect(await db.select().from(schema.dailyDelivery)).toHaveLength(0);
  });
});
