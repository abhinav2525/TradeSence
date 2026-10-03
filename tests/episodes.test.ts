import { test, expect, describe } from "bun:test";
import { findEpisodeSpans, findEpisodes, MERGE_GAP } from "../src/indicators/episodes";

const under = (p: number) => p < 20;

describe("findEpisodeSpans", () => {
  test("a span records its first and last qualifying index and how many qualified", () => {
    // 0:50 1:15 2:12 3:30 4:18, then 12 days at 50, then 17:10
    const pct = [50, 15, 12, 30, 18, ...Array(12).fill(50), 10];
    expect(findEpisodeSpans(pct, under, MERGE_GAP)).toEqual([
      { start: 1, last: 4, sessions: 3 },
      { start: 17, last: 17, sessions: 1 },
    ]);
  });

  test("10 sessions between qualifying days merge; 11 split", () => {
    const merged = [10, ...Array(10).fill(50), 10];
    const split = [10, ...Array(11).fill(50), 10];
    expect(findEpisodeSpans(merged, under, MERGE_GAP)).toEqual([{ start: 0, last: 11, sessions: 2 }]);
    expect(findEpisodeSpans(split, under, MERGE_GAP).map((s) => s.start)).toEqual([0, 12]);
  });

  test("findEpisodes is exactly the span starts", () => {
    const pct = [50, 15, 12, 50, 50, 18, 50, 50, 50, 50, 10];
    for (const gap of [0, 3, MERGE_GAP]) {
      expect(findEpisodes(pct, under, gap)).toEqual(findEpisodeSpans(pct, under, gap).map((s) => s.start));
    }
  });

  test("nothing qualifies: no spans", () => {
    expect(findEpisodeSpans([50, 60], under, MERGE_GAP)).toEqual([]);
  });
});
