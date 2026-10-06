import { test, expect, describe } from "bun:test";
import { HORIZON_LABELS, parseAmount, LIGHTS_DISCLAIMER } from "../src/lib/report-card";

describe("calculator wording", () => {
  // Windows overlap: ten years hold ~2,460 month-long stretches, not 2,460 months.
  test("every horizon is called a stretch, never a calendar unit", () => {
    for (const k of ["1w", "1m", "3m", "1y"] as const) {
      expect(HORIZON_LABELS[k].one).toContain("stretch");
      expect(HORIZON_LABELS[k].many).toContain("stretches");
    }
  });
});

describe("parseAmount", () => {
  // The figures must be for the amount typed, never a silently different one.
  test("uses exactly what was typed", () => {
    expect(parseAmount("500")).toBe(500);
    expect(parseAmount("10000")).toBe(10000);
    expect(parseAmount("2500.5")).toBe(2500.5);
  });
  test("no amount, zero, negative or nonsense gives null (the card asks for an amount)", () => {
    for (const s of ["", "0", "-100", "abc"]) expect(parseAmount(s)).toBeNull();
  });
});

test("the lights carry a 'not advice' line", () => {
  expect(LIGHTS_DISCLAIMER.toLowerCase()).toContain("not advice");
});

import { stockGroups } from "../src/lib/report-card";
import { membershipLine } from "../src/components/StockChecks";
import type { StockReport } from "../src/query/stock-report";

describe("stockGroups: the /stock index (decision 0035)", () => {
  const s = (symbol: string, currentIn: string[]) => ({ symbol, current: currentIn.length > 0, currentIn });
  test("NIFTY 50 members once (even if also in Nifty Bank), bank-only members, then former members", () => {
    const groups = stockGroups([s("AAA", ["nifty50", "bank"]), s("BNK", ["bank"]), s("NFX", ["nifty50"]), s("GONE", [])]);
    expect(groups.map((g) => [g.title, g.stocks.map((x) => x.symbol)])).toEqual([
      ["In the NIFTY 50", ["AAA", "NFX"]],
      ["In Nifty Bank, not the NIFTY 50", ["BNK"]],
      ["In Nifty Financial Services, not the NIFTY 50 or Nifty Bank", []], // StockList hides an empty group
      ["Former members since 2020", ["GONE"]],
    ]);
  });
  test("three indices: each current stock once, under the earliest registered index it is in (decision 0037)", () => {
    const groups = stockGroups([s("AAA", ["nifty50", "bank", "financial-services"]), s("BNK", ["bank", "financial-services"]), s("FIN", ["financial-services"]), s("GONE", [])]);
    expect(groups.map((g) => [g.title, g.stocks.map((x) => x.symbol)])).toEqual([
      ["In the NIFTY 50", ["AAA"]],
      ["In Nifty Bank, not the NIFTY 50", ["BNK"]],
      ["In Nifty Financial Services, not the NIFTY 50 or Nifty Bank", ["FIN"]],
      ["Former members since 2020", ["GONE"]],
    ]);
  });
  test("a stock that left the NIFTY 50 but is in Nifty Bank today is a Bank member, not a former one", () => {
    const groups = stockGroups([{ symbol: "MOVED", current: true, currentIn: ["bank"] }]);
    expect(groups.find((g) => g.stocks.some((x) => x.symbol === "MOVED"))!.title).toBe("In Nifty Bank, not the NIFTY 50");
  });
});

describe("membershipLine: the card's first sentence", () => {
  const r = (key: string, label: string, membership: StockReport["membership"]) =>
    ({ peerIndex: { key, label }, membership }) as unknown as StockReport;
  test("open since the record starts, open since a date, left (with and without a join date)", () => {
    expect(membershipLine(r("nifty50", "NIFTY 50", [{ addedOn: "2020-01-01", removedOn: null }]))).toBe(
      "In the NIFTY 50 since at least Jan 2020 (when the membership record starts).",
    );
    expect(membershipLine(r("bank", "Nifty Bank", [{ addedOn: "2025-12-31", removedOn: null }]))).toBe("In Nifty Bank since 31 Dec 2025.");
    expect(membershipLine(r("nifty50", "NIFTY 50", [{ addedOn: "2020-01-01", removedOn: "2025-03-28" }]))).toBe("Left the NIFTY 50 on 28 Mar 2025.");
    expect(membershipLine(r("bank", "Nifty Bank", [{ addedOn: "2020-01-01", removedOn: "2021-09-30" }, { addedOn: "2022-03-31", removedOn: "2023-03-31" }]))).toBe(
      "Left Nifty Bank on 31 Mar 2023 (joined 31 Mar 2022).",
    );
  });
});
