import { test, expect, describe } from "bun:test";
import { volumeRatios } from "../src/indicators/volume";

const days = (n: number, start = 0) =>
  Array.from({ length: n }, (_, i) => new Date(Date.UTC(2020, 0, 1 + start + i)).toISOString().slice(0, 10));
const ones = (n: number) => new Array<number>(n).fill(1);

describe("volumeRatios", () => {
  test("is today's volume over the average of the 20 sessions before it", () => {
    const vol = [...new Array(20).fill(1000), 3000];
    const r = volumeRatios(days(21), vol, ones(21));
    expect(r[19]).toBeNull(); // only 19 sessions before it
    expect(r[20]!).toBeCloseTo(3, 9);
  });

  test("today is not part of its own baseline", () => {
    const vol = [...new Array(20).fill(1000), 1000, 5000];
    expect(volumeRatios(days(22), vol, ones(22))[21]!).toBeCloseTo(5, 9);
  });

  // A 1:5 split multiplies the share count: raw volume reads 5x with nothing
  // happening. Earlier sessions are scaled by the split factor to compare.
  test("a split does not look like a volume surge", () => {
    const vol = [...new Array(20).fill(1000), 5000];
    const shareFactors = [...new Array(20).fill(5), 1];
    expect(volumeRatios(days(21), vol, shareFactors)[20]!).toBeCloseTo(1, 9);
  });

  test("the baseline restarts after a hole in the data", () => {
    const d = [...days(20), ...days(21, 60)];
    const r = volumeRatios(d, new Array(41).fill(1000), ones(41));
    expect(r[39]).toBeNull(); // 19 sessions since the hole
    expect(r[40]!).toBeCloseTo(1, 9);
  });

  test("no baseline volume means no ratio, not infinity", () => {
    const vol = [...new Array(20).fill(0), 1000];
    expect(volumeRatios(days(21), vol, ones(21))[20]).toBeNull();
  });
});
