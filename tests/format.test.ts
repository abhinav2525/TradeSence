import { test, expect, describe } from "bun:test";
import { signed, formatDayMonth } from "../src/lib/format";

describe("signed", () => {
  test("uses a true minus sign and a plus sign", () => {
    expect(signed(4)).toBe("+4");
    expect(signed(-12)).toBe("−12");
    expect(signed(0)).toBe("0");
    expect(signed(-0.04, 1)).toBe("0.0");
  });

  test("groups large values the Indian way", () => {
    expect(signed(-1560)).toBe("−1,560");
    expect(signed(123456)).toBe("+1,23,456");
    expect(signed(-58.84, 1)).toBe("−58.8");
  });
});

test("formatDayMonth", () => {
  expect(formatDayMonth("2026-09-29")).toBe("29 Sep");
});

import { dateTicks } from "../src/lib/ticks";

describe("dateTicks", () => {
  test("labels each month once on a short window", () => {
    const dates = ["2020-02-24", "2020-02-25", "2020-03-02", "2020-03-23"];
    const { ticks, label } = dateTicks(dates);
    expect(ticks).toEqual(["2020-02-24", "2020-03-02"]);
    expect(ticks.map(label)).toEqual(["Feb ’20", "Mar ’20"]);
  });

  test("labels each year once on a long window, thinned to the maximum", () => {
    const dates = Array.from({ length: 1700 }, (_, i) => new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10));
    const { ticks, label } = dateTicks(dates, 8);
    expect(new Set(ticks.map(label)).size).toBe(ticks.length);
    expect(ticks.length).toBeLessThanOrEqual(8);
  });
});
