import { test, expect, describe } from "bun:test";
import { NIFTY_BANK } from "../src/ingest/indices";
import { membersOn, readMembershipHistory, validateMembershipHistory, HISTORY_START } from "../src/ingest/nifty50-history";
import { fetchConstituents, INDEX_LISTS } from "../src/ingest/index-constituents";

// The committed file is data, and data gets checked like code (decision 0034).
describe("the committed Nifty Bank history", () => {
  const rows = readMembershipHistory(NIFTY_BANK);

  test("follows its size schedule: 12 members until 2025-12-30, 14 from 2025-12-31", () => {
    expect(validateMembershipHistory(rows, NIFTY_BANK.sizes)).toEqual([]);
    expect(membersOn(rows, HISTORY_START)).toHaveLength(12);
    expect(membersOn(rows, "2025-12-30")).toHaveLength(12);
    expect(membersOn(rows, "2025-12-31")).toHaveLength(14);
  });

  test("matches known changes", () => {
    // brought forward from 27 Mar to 19 Mar 2020 after the Yes Bank reconstruction scheme (decision 0036)
    expect(membersOn(rows, "2020-03-18")).toContain("YESBANK");
    expect(membersOn(rows, "2020-03-19")).not.toContain("YESBANK");
    expect(membersOn(rows, "2020-03-19")).toContain("BANDHANBNK");
    expect(membersOn(rows, "2022-03-30")).toContain("RBLBANK");
    expect(membersOn(rows, "2022-03-31")).not.toContain("RBLBANK");
    expect(membersOn(rows, "2024-09-30")).toContain("CANBK");
    expect(membersOn(rows, "2024-09-30")).not.toContain("BANDHANBNK");
    expect(membersOn(rows, "2025-12-31")).toEqual(expect.arrayContaining(["UNIONBANK", "YESBANK"]));
  });

  test("both sides of each change date", () => {
    const on = (d: string) => membersOn(rows, d);
    expect(on("2021-03-30")).toContain("BANKBARODA");
    expect(on("2021-03-30")).not.toContain("AUBANK");
    expect(on("2021-03-31")).toContain("AUBANK");
    expect(on("2021-03-31")).not.toContain("BANKBARODA");
    expect(on("2024-09-27")).toContain("BANDHANBNK");
    expect(on("2024-09-27")).not.toContain("CANBK");
    expect(on("2024-09-30")).toContain("CANBK");
    expect(on("2024-09-30")).not.toContain("BANDHANBNK");
    expect(on("2025-12-30")).not.toContain("UNIONBANK");
    expect(on("2025-12-31")).toContain("UNIONBANK");
  });

  // Live: if this fails, NSE has changed the index and the file needs a new row.
  test("today's members are exactly NSE's published list", async () => {
    const file = INDEX_LISTS.find((x) => x.key === NIFTY_BANK.list)!.file;
    const live = await fetchConstituents(file);
    if (live.status !== "ok") throw new Error(live.message);
    expect(membersOn(rows, new Date().toISOString().slice(0, 10)).sort()).toEqual(live.rows.map((r) => r.symbol).sort());
  }, 30000);
});
