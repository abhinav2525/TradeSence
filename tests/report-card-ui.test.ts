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
