import { test, expect, describe } from "bun:test";
import { adjustmentFactors, findUnexplainedJumps } from "../src/indicators/adjust";

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
