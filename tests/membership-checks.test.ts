import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { and, eq } from "drizzle-orm";
import { NIFTY_BANK, type IndexEntry } from "../src/ingest/indices";
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

  test("an index with no NSE list stored at all is reported as unchecked, never compared", async () => {
    await loadMembership(NIFTY_BANK);
    expect(await membershipWarnings(TODAY, [NIFTY_BANK])).toEqual([
      "could not check Nifty Bank against NSE: its member list was not refreshed today",
    ]);
  });

  test("a period closed in the file but not loaded is reported", async () => {
    await loadMembership(NIFTY_BANK);
    await seedList(bankToday());
    // The database still holds BANKBARODA's 2020 period as open: removed_on missing from one stored row.
    await db.update(schema.indexMembers).set({ removedOn: null })
      .where(and(eq(schema.indexMembers.indexName, NIFTY_BANK.members), eq(schema.indexMembers.symbol, "BANKBARODA"), eq(schema.indexMembers.addedOn, "2020-01-01")));
    const w = await membershipWarnings(TODAY, [NIFTY_BANK]);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("1 period(s) not loaded, 1 stored but not in the file");
  });

  test("an unreadable file is reported and the next index is still checked", async () => {
    await loadMembership(NIFTY_BANK);
    const broken: IndexEntry = { ...NIFTY_BANK, key: "broken", label: "Broken", file: new URL("./no-such-history.csv", NIFTY_BANK.file) };
    const w = await membershipWarnings(TODAY, [broken, NIFTY_BANK]);
    expect(w).toHaveLength(2);
    expect(w[0]).toStartWith("could not read src/ingest/no-such-history.csv");
    expect(w[1]).toBe("could not check Nifty Bank against NSE: its member list was not refreshed today");
  });
});
