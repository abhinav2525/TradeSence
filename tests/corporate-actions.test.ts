import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import {
  classifyAction, parseExDate, fetchCorporateActions, ingestCorporateActions,
} from "../src/ingest/corporate-actions";

// Every subject below is copied verbatim from NSE's corporate-actions feed.
describe("classifyAction", () => {
  test("a face-value split divides by old/new face value", () => {
    expect(classifyAction(
      "Face Value Split (Sub-Division) - From Rs 5/- Per Share To Re 1/- Per Share",
    )).toEqual({ kind: "split", factor: 5 });
    expect(classifyAction(
      "Face Value Split (Sub-Division) - From Rs 10/- Per Share To Rs 2/- Per Share",
    )).toEqual({ kind: "split", factor: 5 });
  });

  test("reads the split wordings NSE has used over the years", () => {
    for (const s of [
      "Face Value Split From Rs 10 To Re 1",
      "Face Value Split From Rs 10/- Per Share To Re 1/- Per Share",
      "Face Value Split (Sub-Division) - From Rs10/- Per Share To Re 1/- Per Share",
      "Face Value Split (Sub-Division) - From Rs 10 /- Per Share To Re 1/- Per Share",
      "Face Value Split (Sub-Division) - From Rs 10 Per Share To Re 1 Per Share",
      // JSWSTEEL 2017-01-04. Read as "other" at first, which left a 10x drop
      // unadjusted — caught only by the unexplained-jump check.
      " Fv Splt Frm Rs 10 To Re 1",
    ]) {
      expect(classifyAction(s)).toEqual({ kind: "split", factor: 10 });
    }
    expect(classifyAction("Fv Splt Frm Rs 10 To Rs 2")).toEqual({ kind: "split", factor: 5 });
  });

  test("a bonus a:b means a new shares for every b held", () => {
    expect(classifyAction("Bonus 1:2")).toEqual({ kind: "bonus", factor: 1.5 });
    expect(classifyAction("Bonus 1:1")).toEqual({ kind: "bonus", factor: 2 });
    expect(classifyAction("Bonus 4:1")).toEqual({ kind: "bonus", factor: 5 });
    expect(classifyAction("Bonus- 1:1")).toEqual({ kind: "bonus", factor: 2 });
    expect(classifyAction("Bonus 1: 1")).toEqual({ kind: "bonus", factor: 2 });
  });

  test("combined events multiply, and a dividend alongside changes nothing", () => {
    expect(classifyAction(
      "Bonus 1:1/Face Value Split (Sub-Division) - From Rs 10/- Per Share To Rs 5/- Per Share",
    )).toEqual({ kind: "bonus+split", factor: 4 });
    expect(classifyAction("Bonus 1:1/Dividend- Rs 2 Per Share"))
      .toEqual({ kind: "bonus", factor: 2 });
    expect(classifyAction(
      "Interim Div - Rs 5/- Per Share + Face Value Split (Sub-Division) - From Rs 10/- Per Share To Re 1/- Per Share",
    )).toEqual({ kind: "split", factor: 10 });
    expect(classifyAction(
      "Annual General Meeting/Dividend - Rs 3 Per Share/Bonus 1:1 (Revised)",
    )).toEqual({ kind: "bonus", factor: 2 });
  });

  test("a consolidation is a reverse split: earlier prices scale up", () => {
    expect(classifyAction("Consolidation Of Equity Shares From Re 1 Per Share To Rs 10 Per Share"))
      .toEqual({ kind: "consolidation", factor: 0.1 });
  });

  test("bonuses of preference shares or debentures do not change the equity count", () => {
    expect(classifyAction("Bonus Ncrps 1:1")).toEqual({ kind: "other", factor: 1 });
    expect(classifyAction("Scheme Of Arrangement - Bonus Ncrps 1:1")).toEqual({ kind: "other", factor: 1 });
    expect(classifyAction("Scheme Of Arangement- Bonus - 1 Debenture For 1 Equity Share Held"))
      .toEqual({ kind: "other", factor: 1 });
  });

  // A demerger's ratio is not in the text; it is worked out from prices at
  // compute time (see demergerFactor). Factor 1 here means "nothing from text".
  test("a demerger is recognised in every wording NSE uses", () => {
    for (const s of [
      "Demerger",
      "Scheme Of Demerger",
      "Merger/Demerger",
      "Scheme Of Arrangement In The Nature Of Demerger",
      "Scheme Of Arrangement Of Demerger",
    ]) {
      expect(classifyAction(s)).toEqual({ kind: "demerger", factor: 1 });
    }
  });

  test("a demerger combined with a split or bonus is unparsed", () => {
    expect(classifyAction("Bonus 1:1/Demerger")).toEqual({ kind: "unparsed", factor: null });
  });

  test("dividends and meetings are recorded as other, factor 1", () => {
    expect(classifyAction("Dividend - Rs 2.50 Per Share")).toEqual({ kind: "other", factor: 1 });
    expect(classifyAction("Annual General Meeting")).toEqual({ kind: "other", factor: 1 });
  });

  // The rule that matters most: a share-count event we cannot read must never
  // quietly become factor 1, or that split would go unadjusted with no signal.
  test("anything share-count-like it cannot read is unparsed, never factor 1", () => {
    expect(classifyAction("Capital Reduction Rs 10 To Rs 1 / Consolidation Rs 1 To Rs.10"))
      .toEqual({ kind: "unparsed", factor: null });
    expect(classifyAction("Face Value Split")).toEqual({ kind: "unparsed", factor: null });
    expect(classifyAction("Bonus issue")).toEqual({ kind: "unparsed", factor: null });
  });
});

describe("parseExDate", () => {
  test("turns NSE's dd-Mon-yyyy into ISO", () => {
    expect(parseExDate("14-Jan-2026")).toBe("2026-01-14");
    expect(parseExDate("04-JUN-2026")).toBe("2026-06-04");
  });

  test("returns null for a missing date rather than inventing one", () => {
    expect(parseExDate("-")).toBeNull();
    expect(parseExDate("")).toBeNull();
  });
});

// Live, like the bhavcopy tests: NSE's feed is the part most likely to change.
describe("fetchCorporateActions", () => {
  test("finds the KOTAKBANK 1:5 split from the live NSE feed", async () => {
    const res = await fetchCorporateActions("2026-01-01", "2026-01-31");
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    const kotak = res.rows.find((r) => r.symbol === "KOTAKBANK" && r.kind === "split");
    expect(kotak).toMatchObject({ exDate: "2026-01-14", factor: 5 });
  }, 30000);

  test("reports a garbage payload as an error, not as zero actions", async () => {
    const res = await fetchCorporateActions("2026-01-01", "2026-01-31", {
      download: async () => ({ kind: "ok", bytes: new TextEncoder().encode("<html>blocked</html>") }),
    });
    expect(res.status).toBe("error");
  });
});

function payload(rows: object[]) {
  return async () => ({ kind: "ok" as const, bytes: new TextEncoder().encode(JSON.stringify(rows)) });
}

const nseRow = (symbol: string, exDate: string, subject: string, series = "EQ") => ({
  symbol, exDate, subject, series, comp: `${symbol} Ltd`, recDate: exDate,
});

describe("ingestCorporateActions", () => {
  beforeEach(async () => {
    await db.delete(schema.corporateActions);
  });

  test("stores every equity action with its factor, and is idempotent", async () => {
    const download = payload([
      nseRow("KOTAKBANK", "14-Jan-2026",
        "Face Value Split (Sub-Division) - From Rs 5/- Per Share To Re 1/- Per Share"),
      nseRow("KOTAKBANK", "17-Jul-2026", "Dividend - Rs 0.65 Per Share"),
      nseRow("SOMEBOND", "01-Feb-2026", "Interest Payment", "H5"),
    ]);

    const first = await ingestCorporateActions("2026-01-01", "2026-12-31", { download });
    expect(first).toMatchObject({ status: "ok", stored: 2, unparsed: 0, skipped: 0 });
    await ingestCorporateActions("2026-01-01", "2026-12-31", { download });

    const rows = await db.select().from(schema.corporateActions);
    expect(rows).toHaveLength(2);
    const split = rows.find((r) => r.kind === "split")!;
    expect(split).toMatchObject({
      symbol: "KOTAKBANK", exDate: "2026-01-14", factor: 5, company: "KOTAKBANK Ltd",
    });
  });

  test("keeps unparsed share-count events so they can be reported", async () => {
    const res = await ingestCorporateActions("2026-01-01", "2026-12-31", {
      download: payload([nseRow("ODDCO", "02-Mar-2026", "Capital Reduction Rs 10 To Rs 1")]),
    });
    expect(res).toMatchObject({ status: "ok", stored: 1, unparsed: 1 });
    const [row] = await db.select().from(schema.corporateActions);
    expect(row).toMatchObject({ kind: "unparsed", factor: null });
  });

  test("skips a row with no ex-date and counts it", async () => {
    const res = await ingestCorporateActions("2026-01-01", "2026-12-31", {
      download: payload([nseRow("NODATE", "-", "Bonus 1:1")]),
    });
    expect(res).toMatchObject({ status: "ok", stored: 0, skipped: 1 });
  });
});
