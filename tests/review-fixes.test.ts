import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema, sql } from "../src/db";
import { parseUdiff, parseLegacy, fetchBhavcopy } from "../src/ingest/bhavcopy";
import { loadNifty50History } from "../src/ingest/nifty50-history";
import { breadthSeries, latestBreakdown } from "../src/query/breadth";
import { computeIndicators } from "../src/indicators/compute";

const UDIFF_HEADER =
  "TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,OpnIntrst,ChngInOpnIntrst,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,SsnId,NewBrdLotQty,Rmks,Rsvd1,Rsvd2,Rsvd3,Rsvd4";
const UDIFF_ROW =
  "2026-09-25,2026-09-25,CM,NSE,STK,2885,INE002A01018,RELIANCE,EQ,,,,,RELIANCE INDUSTRIES LTD,1210.50,1227.40,1210.50,1226.00,1226.00,1219.20,,1226.00,,,13138735,16035076079.70,254321,F1,1,,,,,";

// ---------------------------------------------------------------- I2
describe("I2 — header validation covers every column the parser reads", () => {
  test("udiff rejects a header missing PrvsClsgPric", () => {
    const header = UDIFF_HEADER.replace("PrvsClsgPric", "RenamedByNSE");
    expect(() => parseUdiff(`${header}\n${UDIFF_ROW}`)).toThrow(/header/i);
  });

  test("udiff rejects a header missing TtlTrfVal", () => {
    const header = UDIFF_HEADER.replace("TtlTrfVal", "RenamedByNSE");
    expect(() => parseUdiff(`${header}\n${UDIFF_ROW}`)).toThrow(/header/i);
  });

  test("legacy rejects a header missing PREVCLOSE", () => {
    const csv =
      "SYMBOL,SERIES,OPEN,HIGH,LOW,CLOSE,LAST,RENAMED,TOTTRDQTY,TOTTRDVAL,TIMESTAMP,TOTALTRADES,ISIN,\n" +
      "RELIANCE,EQ,2550,2579,2548.2,2575.9,2577.9,2547.2,2453414,6292210762.05,02-JAN-2023,97175,INE002A01018,";
    expect(() => parseLegacy(csv)).toThrow(/header/i);
  });
});

// ---------------------------------------------------------------- I3
describe("I3 — a row with no usable close is dropped, never stored as zero", () => {
  test("udiff drops a row whose close is blank", () => {
    const blank = UDIFF_ROW.replace(",1226.00,1226.00,1219.20,", ",,1226.00,1219.20,");
    const rows = parseUdiff(`${UDIFF_HEADER}\n${blank}`);
    expect(rows).toHaveLength(0);
  });

  test("udiff keeps a row with a valid close", () => {
    expect(parseUdiff(`${UDIFF_HEADER}\n${UDIFF_ROW}`)).toHaveLength(1);
  });

  test("legacy drops a row whose close is unparseable", () => {
    const csv =
      "SYMBOL,SERIES,OPEN,HIGH,LOW,CLOSE,LAST,PREVCLOSE,TOTTRDQTY,TOTTRDVAL,TIMESTAMP,TOTALTRADES,ISIN,\n" +
      "RELIANCE,EQ,2550,2579,2548.2,-,2577.9,2547.2,2453414,6292210762.05,02-JAN-2023,97175,INE002A01018,";
    expect(parseLegacy(csv)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------- I4
describe("I4 — a corrupt archive is an error, not a crash", () => {
  test("reports an error instead of throwing when the zip is corrupt", async () => {
    const garbage = new TextEncoder().encode("<html>not a zip</html>");
    const res = await fetchBhavcopy("2026-09-25", {
      download: async () => ({ kind: "ok", bytes: garbage }),
    });
    expect(res.status).toBe("error");
    if (res.status === "error") expect(res.message.length).toBeGreaterThan(0);
  });

  test("reports an error instead of throwing when the CSV header is unknown", async () => {
    const { zipSync } = await import("fflate");
    const csv = new TextEncoder().encode("TOTALLY,DIFFERENT,COLUMNS\n1,2,3");
    const zipped = zipSync({ "x.csv": csv });
    const res = await fetchBhavcopy("2026-09-25", {
      download: async () => ({ kind: "ok", bytes: zipped }),
    });
    expect(res.status).toBe("error");
  });
});

// ------------------------------------------------- legacy two-digit years
describe("NSE legacy files sometimes carry a two-digit year", () => {
  const row = (ts: string) =>
    "SYMBOL,SERIES,OPEN,HIGH,LOW,CLOSE,LAST,PREVCLOSE,TOTTRDQTY,TOTTRDVAL,TIMESTAMP,TOTALTRADES,ISIN,\n" +
    `RELIANCE,EQ,2550,2579,2548.2,2575.9,2577.9,2547.2,2453414,6292210762.05,${ts},97175,INE002A01018,`;

  test("expands DD-MON-YY to a four-digit ISO date", () => {
    // Real case: 2020-07-13 ships as 13-JUL-20 and used to yield "20-07-13".
    expect(parseLegacy(row("13-JUL-20"))[0]!.tradeDate).toBe("2020-07-13");
  });

  test("still handles the four-digit form", () => {
    expect(parseLegacy(row("02-JAN-2023"))[0]!.tradeDate).toBe("2023-01-02");
  });

  test("rejects a date it cannot turn into a real ISO date", () => {
    expect(() => parseLegacy(row("32-XXX-20"))).toThrow();
  });
});

// ---------------------------------------------------------------- I1
describe("I1 — re-seeding membership never double-counts a constituent", () => {
  beforeEach(async () => {
    await db.delete(schema.dailyIndicators);
    await db.delete(schema.indexMembers);
  });

  test("loading membership twice leaves one open interval per symbol", async () => {
    await loadNifty50History();
    await loadNifty50History();
    const [{ n }] = await sql`
      select count(*)::int as n from index_members
      where index_name = 'NIFTY50' and removed_on is null`;
    expect(n).toBe(50);
  }, 60000);

  test("breadth counts a duplicated member only once", async () => {
    await db.insert(schema.indexMembers).values([
      { indexName: "NIFTY50", symbol: "DUP", addedOn: "2020-01-01", removedOn: null },
      { indexName: "NIFTY50", symbol: "DUP", addedOn: "2021-01-01", removedOn: null },
    ]);
    await db.insert(schema.dailyIndicators).values({
      tradeDate: "2022-01-03", symbol: "DUP", close: 110, sma50: 100, sma200: 100, ema200: 100,
    });

    const series = await breadthSeries("sma200");
    expect(series[0]!.total).toBe(1);
    expect(series[0]!.above).toBe(1);

    const latest = await latestBreakdown("sma200");
    expect(latest.above.map((r) => r.symbol)).toEqual(["DUP"]);
  });
});

// ---------------------------------------------------------------- I5
describe("I5 — a discontinuity in the price history does not fabricate an average", () => {
  beforeEach(async () => {
    await db.delete(schema.dailyIndicators);
    await db.delete(schema.dailyPrices);
    await db.delete(schema.indexMembers);
  });

  test("the average restarts after a multi-year gap instead of spanning it", async () => {
    const rows: typeof schema.dailyPrices.$inferInsert[] = [];
    const push = (startYear: number, n: number, base: number) => {
      for (let i = 0; i < n; i++) {
        const d = new Date(Date.UTC(startYear, 0, 4));
        d.setUTCDate(d.getUTCDate() + i);
        const close = base + i * 0.1;
        rows.push({
          tradeDate: d.toISOString().slice(0, 10), symbol: "GAPCO", series: "EQ",
          open: close, high: close, low: close, close, prevClose: close,
          volume: 100, turnover: close * 100,
        });
      }
    };
    push(2018, 260, 100);  // segment A
    push(2024, 260, 900);  // segment B, six years later and 9x the price

    await db.insert(schema.dailyPrices).values(rows.slice(0, 260));
    await db.insert(schema.dailyPrices).values(rows.slice(260));
    await db.insert(schema.indexMembers).values({
      indexName: "NIFTY50", symbol: "GAPCO", addedOn: "2018-01-01", removedOn: null,
    });
    await computeIndicators();

    // First bar of segment B must not carry an average built from segment A.
    const firstB = rows[260]!.tradeDate;
    const [b0] = await sql`
      select sma_200, ema_200 from daily_indicators
      where symbol = 'GAPCO' and trade_date = ${firstB}`;
    expect(b0!.sma_200).toBeNull();
    expect(b0!.ema_200).toBeNull();

    // And once segment B has 200 of its own bars, the average reflects only B.
    const lateB = rows[260 + 210]!.tradeDate;
    const [b1] = await sql`
      select sma_200 from daily_indicators
      where symbol = 'GAPCO' and trade_date = ${lateB}`;
    expect(Number(b1!.sma_200)).toBeGreaterThan(800); // B prices, not a blend with A's ~100
  }, 60000);
});

// ---------------------------------------------------------------- I6
describe("I6 — the file's own date must match the date we asked for", () => {
  beforeEach(async () => {
    await db.delete(schema.dailyPrices);
    await db.delete(schema.ingestLog);
  });

  test("a file whose TradDt disagrees with the request is an error, not silent", async () => {
    const { assertDateMatches } = await import("../src/ingest/ingest-day");
    expect(assertDateMatches("2026-03-15", [{ tradeDate: "2026-03-14" } as any])).toBe(false);
    expect(assertDateMatches("2026-03-15", [{ tradeDate: "2026-03-15" } as any])).toBe(true);
  });
});
