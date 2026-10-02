import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import {
  parseSymbolChanges, symbolLineage, fetchSymbolChanges, ingestSymbolChanges,
} from "../src/ingest/symbol-changes";

// Lines copied verbatim from NSE's symbolchange.csv (no header row).
describe("parseSymbolChanges", () => {
  test("reads company, old symbol, new symbol and date", () => {
    const { rows, rejected } = parseSymbolChanges(
      "ETERNAL LIMITED,ZOMATO,ETERNAL,09-APR-2025\r\n" +
      "Shriram Finance Limited,SRTRANSFIN,SHRIRAMFIN,20-DEC-2022\n",
    );
    expect(rejected).toEqual([]);
    expect(rows).toEqual([
      { company: "ETERNAL LIMITED", oldSymbol: "ZOMATO", newSymbol: "ETERNAL", changedOn: "2025-04-09" },
      { company: "Shriram Finance Limited", oldSymbol: "SRTRANSFIN", newSymbol: "SHRIRAMFIN", changedOn: "2022-12-20" },
    ]);
  });

  test("tolerates an empty company name and stray spaces", () => {
    const { rows } = parseSymbolChanges(",780LTFL30,799LTFL30,19-FEB-2025\n M&M LTD , OLDMM , M&M ,01-JAN-2010\n");
    expect(rows[0]).toEqual({ company: null, oldSymbol: "780LTFL30", newSymbol: "799LTFL30", changedOn: "2025-02-19" });
    expect(rows[1]).toEqual({ company: "M&M LTD", oldSymbol: "OLDMM", newSymbol: "M&M", changedOn: "2010-01-01" });
  });

  test("rejects lines it cannot read instead of guessing", () => {
    const { rows, rejected } = parseSymbolChanges("garbage line\nA LTD,OLD,NEW,not-a-date\n");
    expect(rows).toEqual([]);
    expect(rejected).toHaveLength(2);
  });
});

const ch = (oldSymbol: string, newSymbol: string, changedOn: string) =>
  ({ oldSymbol, newSymbol, changedOn });

describe("symbolLineage", () => {
  test("a symbol never renamed covers all of time", () => {
    expect(symbolLineage("RELIANCE", [])).toEqual([{ symbol: "RELIANCE", from: null, to: null }]);
  });

  test("follows a chain back through every earlier symbol", () => {
    expect(symbolLineage("TATACONSUM", [
      ch("TATATEA", "TATAGLOBAL", "2010-07-21"),
      ch("TATAGLOBAL", "TATACONSUM", "2020-02-27"),
    ])).toEqual([
      { symbol: "TATACONSUM", from: "2020-02-27", to: null },
      { symbol: "TATAGLOBAL", from: "2010-07-21", to: "2020-02-27" },
      { symbol: "TATATEA", from: null, to: "2010-07-21" },
    ]);
  });

  // A reused ticker: OLDCO's symbol later went to a different company. Only
  // the dates when it belonged to *our* company may be used.
  test("uses an old symbol only for the dates it belonged to this company", () => {
    expect(symbolLineage("NEWCO", [
      ch("XYZ", "NEWCO", "2020-01-01"),
      ch("XYZ", "OTHERCO", "2015-01-01"), // unrelated: XYZ's earlier owner
    ]).find((s) => s.symbol === "XYZ")).toEqual({ symbol: "XYZ", from: "2015-01-01", to: "2020-01-01" });
  });

  test("picks the most recent rename when several old symbols map to one", () => {
    expect(symbolLineage("X", [
      ch("A", "X", "2012-01-01"),
      ch("B", "X", "2020-01-01"),
    ]).slice(0, 2)).toEqual([
      { symbol: "X", from: "2020-01-01", to: null },
      { symbol: "B", from: null, to: "2020-01-01" },
    ]);
  });

  test("a rename cycle cannot loop forever", () => {
    const out = symbolLineage("A", [ch("B", "A", "2020-01-01"), ch("A", "B", "2019-01-01")]);
    expect(out.length).toBeLessThan(10);
  });
});

describe("fetchSymbolChanges", () => {
  test("downloads NSE's live list, which includes ZOMATO -> ETERNAL", async () => {
    const res = await fetchSymbolChanges();
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.rows.length).toBeGreaterThan(1000);
    expect(res.rows).toContainEqual(
      { company: "ETERNAL LIMITED", oldSymbol: "ZOMATO", newSymbol: "ETERNAL", changedOn: "2025-04-09" },
    );
  }, 30000);

  test("an HTML error page is an error, not an empty list", async () => {
    const res = await fetchSymbolChanges({
      download: async () => ({ kind: "ok", bytes: new TextEncoder().encode("<html>blocked</html>") }),
    });
    expect(res.status).toBe("error");
  });
});

describe("ingestSymbolChanges", () => {
  beforeEach(async () => {
    await db.delete(schema.symbolChanges);
  });

  test("stores the list and is idempotent", async () => {
    const csv = "ETERNAL LIMITED,ZOMATO,ETERNAL,09-APR-2025\nTATA CONSUMER,TATAGLOBAL,TATACONSUM,27-FEB-2020\n";
    const download = async () => ({ kind: "ok" as const, bytes: new TextEncoder().encode(csv) });
    expect(await ingestSymbolChanges({ download })).toEqual({ status: "ok", stored: 2, rejected: 0 });
    await ingestSymbolChanges({ download });
    expect(await db.select().from(schema.symbolChanges)).toHaveLength(2);
  });
});
