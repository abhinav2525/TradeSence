import { test, expect, describe } from "bun:test";
import { parseUdiff, parseLegacy, bhavcopyUrl } from "../src/ingest/bhavcopy";

// Real rows copied verbatim from NSE archives.
const UDIFF_CSV = [
  "TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,OpnIntrst,ChngInOpnIntrst,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,SsnId,NewBrdLotQty,Rmks,Rsvd1,Rsvd2,Rsvd3,Rsvd4",
  "2026-09-25,2026-09-25,CM,NSE,STK,2885,INE002A01018,RELIANCE,EQ,,,,,RELIANCE INDUSTRIES LTD,1210.50,1227.40,1210.50,1226.00,1226.00,1219.20,,1226.00,,,13138735,16035076079.70,254321,F1,1,,,,,",
  "2026-09-25,2026-09-25,CM,NSE,STK,19078,IN0020200104,SGBJUN28,GB,,,,,2.5%GOLDBONDS2028SR-III,14925.83,15044.00,14925.83,15040.00,15040.00,14925.83,,15040.00,,,46,689144.59,15,F1,1,,,,,",
  "2026-09-25,2026-09-25,CM,NSE,STK,1234,INE123A01011,SOMEBE,BE,,,,,SOME BE SERIES LTD,10.00,11.00,9.50,10.50,10.50,10.00,,10.50,,,1000,10500.00,10,F1,1,,,,,",
].join("\n");

const LEGACY_CSV = [
  "SYMBOL,SERIES,OPEN,HIGH,LOW,CLOSE,LAST,PREVCLOSE,TOTTRDQTY,TOTTRDVAL,TIMESTAMP,TOTALTRADES,ISIN,",
  "RELIANCE,EQ,2550,2579,2548.2,2575.9,2577.9,2547.2,2453414,6292210762.05,02-JAN-2023,97175,INE002A01018,",
  "1018GS2026,GS,118,118,118,118,118,116,648,76464,02-JAN-2023,4,IN0020010081,",
].join("\n");

describe("parseUdiff", () => {
  test("parses an EQ row into typed fields with an ISO date", () => {
    const rows = parseUdiff(UDIFF_CSV);
    const reliance = rows.find((r) => r.symbol === "RELIANCE")!;
    expect(reliance).toBeDefined();
    expect(reliance.tradeDate).toBe("2026-09-25");
    expect(reliance.series).toBe("EQ");
    expect(reliance.open).toBe(1210.5);
    expect(reliance.high).toBe(1227.4);
    expect(reliance.low).toBe(1210.5);
    expect(reliance.close).toBe(1226.0);
    expect(reliance.prevClose).toBe(1219.2);
    expect(reliance.volume).toBe(13138735);
    expect(reliance.turnover).toBeCloseTo(16035076079.7, 1);
  });

  test("keeps EQ and BE series and drops everything else", () => {
    const series = parseUdiff(UDIFF_CSV).map((r) => r.series).sort();
    expect(series).toEqual(["BE", "EQ"]);
  });

  test("throws when the header is not a bhavcopy header", () => {
    expect(() => parseUdiff("<html>404 Not Found</html>")).toThrow(/header/i);
  });
});

describe("parseLegacy", () => {
  test("parses an EQ row and converts DD-MON-YYYY to an ISO date", () => {
    const rows = parseLegacy(LEGACY_CSV);
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.symbol).toBe("RELIANCE");
    expect(r.tradeDate).toBe("2023-01-02");
    expect(r.close).toBe(2575.9);
    expect(r.prevClose).toBe(2547.2);
    expect(r.volume).toBe(2453414);
    expect(r.turnover).toBeCloseTo(6292210762.05, 1);
  });

  test("throws when the header is not a bhavcopy header", () => {
    expect(() => parseLegacy("oops,not,a,bhavcopy")).toThrow(/header/i);
  });
});

describe("bhavcopyUrl", () => {
  test("uses the udiff format on and after 2024-01-01", () => {
    const { url, format } = bhavcopyUrl("2026-09-25");
    expect(format).toBe("udiff");
    expect(url).toBe(
      "https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_20260925_F_0000.csv.zip",
    );
  });

  test("uses the legacy format before 2024-01-01", () => {
    const { url, format } = bhavcopyUrl("2023-01-02");
    expect(format).toBe("legacy");
    expect(url).toBe(
      "https://nsearchives.nseindia.com/content/historical/EQUITIES/2023/JAN/cm02JAN2023bhav.csv.zip",
    );
  });
});
