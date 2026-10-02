import { test, expect, describe } from "bun:test";
import { adjustmentFactors, findUnexplainedJumps, demergerFactor } from "../src/indicators/adjust";

const dates = ["2026-01-12", "2026-01-13", "2026-01-14", "2026-01-15"];

describe("adjustmentFactors", () => {
  test("divides only the days before the ex-date; the ex-date already trades split", () => {
    expect(adjustmentFactors(dates, [{ exDate: "2026-01-14", factor: 5 }]))
      .toEqual([5, 5, 1, 1]);
  });

  test("events compound, and two on the same day multiply", () => {
    expect(adjustmentFactors(dates, [
      { exDate: "2026-01-13", factor: 2 },
      { exDate: "2026-01-15", factor: 5 },
      { exDate: "2026-01-15", factor: 2 },
    ])).toEqual([20, 10, 10, 1]);
  });

  test("an event after the last day scales everything alike", () => {
    expect(adjustmentFactors(dates, [{ exDate: "2026-02-01", factor: 2 }]))
      .toEqual([2, 2, 2, 2]);
  });

  test("no events means no adjustment", () => {
    expect(adjustmentFactors(dates, [])).toEqual([1, 1, 1, 1]);
  });
});

describe("demergerFactor", () => {
  // TATAMOTORS, 2025-10-14: commercial vehicles demerged. Real bhavcopy values.
  const d = ["2025-10-10", "2025-10-13", "2025-10-14", "2025-10-15"];
  const opens = [684.8, 679, 400, 403];
  const closes = [678.95, 660.75, 395.45, 390.85];

  test("is the last close before the ex-date over the ex-date open", () => {
    // TradingView's adjustment for the same event is 1 / 0.6037 = 1.6565.
    expect(demergerFactor(d, opens, closes, "2025-10-14")!).toBeCloseTo(660.75 / 400, 6);
  });

  test("uses the first trading day if the ex-date itself was a holiday", () => {
    expect(demergerFactor(["2025-10-10", "2025-10-13"], [684.8, 400], [678.95, 395], "2025-10-11")!)
      .toBeCloseTo(678.95 / 400, 6);
  });

  test("gives up rather than guess when it cannot be worked out", () => {
    expect(demergerFactor(d, opens, closes, "2025-10-10")).toBeNull();           // no day before
    expect(demergerFactor(d, opens, closes, "2025-12-01")).toBeNull();           // no day after
    expect(demergerFactor(d, [684.8, 679, 700, 403], closes, "2025-10-14")).toBeNull(); // opened higher
    expect(demergerFactor(["2025-10-10", "2025-11-20"], [1, 400], [660, 395], "2025-10-14")).toBeNull(); // first trade weeks later
  });
});

describe("findUnexplainedJumps", () => {
  test("a split that has a matching action is not a jump", () => {
    const closes = [2130, 2132.6, 421, 418];
    const factors = adjustmentFactors(dates, [{ exDate: "2026-01-14", factor: 5 }]);
    expect(findUnexplainedJumps(dates, closes, factors)).toEqual([]);
  });

  test("an overnight move beyond 30% with no action behind it is reported", () => {
    const closes = [2130, 2132.6, 421, 418];
    expect(findUnexplainedJumps(dates, closes, [1, 1, 1, 1])).toEqual([
      { date: "2026-01-14", from: 2132.6, to: 421 },
    ]);
  });

  test("ordinary moves are not reported", () => {
    expect(findUnexplainedJumps(dates, [100, 110, 95, 120], [1, 1, 1, 1])).toEqual([]);
  });
});
