import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { NIFTY_BANK } from "../src/ingest/indices";
import { loadMembership, membersOn, readMembershipHistory } from "../src/ingest/nifty50-history";
import { membershipWarnings } from "../src/ingest/membership-checks";

const TODAY = "2026-10-05";
const bankToday = () => membersOn(readMembershipHistory(NIFTY_BANK), TODAY);
const seedList = (symbols: string[], fetchedOn = TODAY) =>
  db.insert(schema.indexConstituents).values(symbols.map((symbol) => ({ indexKey: NIFTY_BANK.list, symbol, industry: "Financial Services", fetchedOn })));

describe("membershipWarnings (nightly: files vs NSE's lists and vs the database)", () => {
  beforeEach(async () => {
    await db.delete(schema.dailyIndicators);
    await db.delete(schema.indexMembers);
    await db.delete(schema.indexConstituents);
  });

  test("silent when the file, the database and NSE's list agree", async () => {
    await loadMembership(NIFTY_BANK);
    await seedList(bankToday());
    expect(await membershipWarnings(TODAY, [NIFTY_BANK])).toEqual([]);
  });

  test("names what NSE added and removed when its list moves on", async () => {
    await loadMembership(NIFTY_BANK);
    await seedList([...bankToday().filter((s) => s !== "YESBANK"), "NEWBANK"]);
    const w = await membershipWarnings(TODAY, [NIFTY_BANK]);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("Nifty Bank changed: NSE added NEWBANK, removed YESBANK");
    expect(w[0]).toContain("niftybank-history.csv");
  });

  test("says so when today's list was not refreshed, instead of comparing with a stale one", async () => {
    await loadMembership(NIFTY_BANK);
    await seedList(bankToday(), "2026-10-04");
    expect(await membershipWarnings(TODAY, [NIFTY_BANK])).toEqual([
      "could not check Nifty Bank against NSE: its member list was not refreshed today",
    ]);
  });

  test("warns when the file was edited but not loaded", async () => {
    await seedList(bankToday());
    await db.insert(schema.indexMembers).values({ indexName: NIFTY_BANK.members, symbol: "OLDBANK", addedOn: "2020-01-01", removedOn: null });
    const w = await membershipWarnings(TODAY, [NIFTY_BANK]);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("niftybank-history.csv differs from the database");
    expect(w[0]).toContain("bun run ingest:members bank");
  });
});
