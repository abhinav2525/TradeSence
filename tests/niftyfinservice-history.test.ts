import { test, expect, describe } from "bun:test";
import { NIFTY_FIN_SERVICE } from "../src/ingest/indices";
import { membersOn, readMembershipHistory, validateMembershipHistory, HISTORY_START } from "../src/ingest/nifty50-history";
import { fetchConstituents, INDEX_LISTS } from "../src/ingest/index-constituents";

// The committed file is data, and data gets checked like code (decisions 0034, 0037).
describe("the committed Nifty Financial Services history", () => {
  const rows = readMembershipHistory(NIFTY_FIN_SERVICE);
  const on = (d: string) => membersOn(rows, d);

  test("follows its size schedule: 20 members on every day since 2020-01-01", () => {
    expect(NIFTY_FIN_SERVICE.sizes).toEqual([{ from: "2020-01-01", n: 20 }]);
    expect(validateMembershipHistory(rows, NIFTY_FIN_SERVICE.sizes)).toEqual([]);
    expect(on(HISTORY_START)).toHaveLength(20);
  });

  test("26 Jun 2020 (the March 2020 review, deferred by COVID): EDELWEISS and IBULHSGFIN out, HDFCAMC and PEL in", () => {
    for (const s of ["EDELWEISS", "IBULHSGFIN"]) {
      expect(on("2020-06-25")).toContain(s);
      expect(on("2020-06-26")).not.toContain(s);
    }
    for (const s of ["HDFCAMC", "PEL"]) {
      expect(on("2020-06-25")).not.toContain(s);
      expect(on("2020-06-26")).toContain(s);
    }
    expect(on("2020-03-27")).toContain("EDELWEISS"); // not on the announced 27 Mar date
  });

  test("8 Aug 2022: PEL out, IEX in", () => {
    expect(on("2022-08-07")).toContain("PEL");
    expect(on("2022-08-07")).not.toContain("IEX");
    expect(on("2022-08-08")).not.toContain("PEL");
    expect(on("2022-08-08")).toContain("IEX");
  });

  test("10 Oct 2024: IDFC out, MCX in", () => {
    expect(on("2024-10-09")).toContain("IDFC");
    expect(on("2024-10-09")).not.toContain("MCX");
    expect(on("2024-10-10")).not.toContain("IDFC");
    expect(on("2024-10-10")).toContain("MCX");
  });

  test("30 Mar 2026: ICICIPRULI out, MFSL in", () => {
    expect(on("2026-03-29")).toContain("ICICIPRULI");
    expect(on("2026-03-29")).not.toContain("MFSL");
    expect(on("2026-03-30")).not.toContain("ICICIPRULI");
    expect(on("2026-03-30")).toContain("MFSL");
  });

  test("Shriram Finance is stored under today's symbol, listed as SRTRANSFIN", () => {
    const r = rows.filter((x) => x.symbol === "SHRIRAMFIN");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ addedOn: "2020-01-01", removedOn: null, listedAs: "SRTRANSFIN" });
    expect(rows.some((x) => x.symbol === "SRTRANSFIN")).toBe(false);
  });

  // Live: if this fails, NSE has changed the index and the file needs a new row.
  test("today's members are exactly NSE's published list", async () => {
    const file = INDEX_LISTS.find((x) => x.key === NIFTY_FIN_SERVICE.list)!.file;
    const live = await fetchConstituents(file);
    if (live.status !== "ok") throw new Error(live.message);
    expect(on(new Date().toISOString().slice(0, 10)).sort()).toEqual(live.rows.map((r) => r.symbol).sort());
  }, 30000);
});
