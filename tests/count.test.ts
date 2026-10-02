import { test, expect, describe } from "bun:test";
import { countFrame, countPlan, formatLike, parseShown } from "../src/lib/count";

const SAMPLES = ["16", "−24", "+12", "0", "35.7", "−58.8", "−1,560", "2,300", "1,23,456", "₹476 cr", "0.9×", "+4.6%", "−36%", "81%", "92nd", "1st", "13th"];

describe("parseShown / formatLike", () => {
  test("every on-screen figure round-trips exactly", () => {
    for (const t of SAMPLES) {
      const s = parseShown(t);
      expect(s).not.toBeNull();
      expect(formatLike(s!, s!.value)).toBe(t);
    }
  });
  test("reads the value with its sign", () => {
    expect(parseShown("−1,560")!.value).toBe(-1560);
    expect(parseShown("+4.6%")!.value).toBe(4.6);
    expect(parseShown("₹476 cr")!.value).toBe(476);
  });
  test("intermediate frames keep the figure's shape", () => {
    expect(formatLike(parseShown("−1,560")!, -780.4)).toBe("−780");
    expect(formatLike(parseShown("₹476 cr")!, 1234.4)).toBe("₹1,234 cr");
    expect(formatLike(parseShown("+4.6%")!, 2.34)).toBe("+2.3%");
    expect(formatLike(parseShown("16")!, 7.6)).toBe("8");
    expect(formatLike(parseShown("92nd")!, 41.2)).toBe("41st");
    expect(formatLike(parseShown("16")!, -0.2)).toBe("0"); // never "−0"
  });
  test("anything that isn't a plain figure is left alone", () => {
    for (const t of ["—", "12–80", "1 Oct 2026", "", "Not enough history", "6 of 20"]) expect(parseShown(t)).toBeNull();
  });
});

describe("countFrame", () => {
  test("starts at from, ends exactly at to, and holds there", () => {
    expect(countFrame(0, 16, 0)).toBe(0);
    expect(countFrame(0, 16, 1)).toBe(16);
    expect(countFrame(0, 16, 7)).toBe(16);
    expect(countFrame(3, 9, -1)).toBe(3);
  });
  test("moves one way only (ease-out), negatives included", () => {
    let last = 0;
    for (let i = 1; i <= 20; i++) {
      const v = countFrame(0, -24, i / 20);
      expect(v).toBeLessThanOrEqual(last);
      expect(v).toBeGreaterThanOrEqual(-24);
      last = v;
    }
    expect(countFrame(0, 10, 0.5)).toBeGreaterThan(5); // ease-out: past halfway at half time
  });
  test("from === to stays put", () => {
    expect(countFrame(5, 5, 0.3)).toBe(5);
  });
});

describe("countPlan (review fix: no 16 → 0 → 16 on slow phones)", () => {
  test("first appearance, still hidden: count from 0, slowly", () => {
    expect(countPlan(null, false)).toEqual({ from: 0, duration: "slow" });
  });
  test("first appearance, but the figure is already showing (the failsafe revealed it): don't count", () => {
    expect(countPlan(null, true)).toBeNull();
  });
  test("a change: count from what is on screen, quickly", () => {
    expect(countPlan(10, false)).toEqual({ from: 10, duration: "base" });
    expect(countPlan(10, true)).toEqual({ from: 10, duration: "base" });
  });
});
