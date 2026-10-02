import { test, expect, describe } from "bun:test";
import { forwardReturn, summarize, findEpisodes, bucketOf } from "../src/research/forward-returns";

describe("forwardReturn", () => {
  test("is the % change from this close to the close h sessions later", () => {
    expect(forwardReturn([100, 110, 121], 0, 2)).toBeCloseTo(21, 9);
  });

  test("is null when the future isn't known yet", () => {
    expect(forwardReturn([100, 110], 1, 1)).toBeNull();
  });
});

describe("summarize", () => {
  test("gives count, mean, median, share positive, worst and best", () => {
    expect(summarize([-10, 0, 5, 25])).toEqual({ n: 4, mean: 5, median: 2.5, pctPositive: 50, min: -10, max: 25 });
  });

  test("an empty bucket summarizes to nulls, not zeros", () => {
    expect(summarize([])).toEqual({ n: 0, mean: null, median: null, pctPositive: null, min: null, max: null });
  });
});

describe("bucketOf", () => {
  test("puts each reading in its band, edges going up", () => {
    expect([0, 19.9, 20, 59.99, 80, 100].map(bucketOf))
      .toEqual(["<20", "<20", "20–40", "40–60", "≥80", "≥80"]);
  });
});

describe("findEpisodes", () => {
  const pct = [50, 15, 12, 50, 50, 18, 50, 50, 50, 50, 10];

  test("groups consecutive qualifying days into one episode starting on the first", () => {
    expect(findEpisodes(pct, (p) => p < 20, 0)).toEqual([1, 5, 10]);
  });

  test("merges episodes separated by a short gap: one panic, not three", () => {
    expect(findEpisodes(pct, (p) => p < 20, 3)).toEqual([1, 10]);
  });
});
