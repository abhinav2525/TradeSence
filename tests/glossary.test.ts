import { test, expect, describe } from "bun:test";
import { GLOSSARY, TOPICS, isTermId, termHref, type TermId } from "../src/lib/glossary";
import { todayLine } from "../src/lib/glossary";

const entries = Object.values(GLOSSARY);

describe("the glossary", () => {
  test("every entry is complete", () => {
    for (const e of entries) {
      for (const f of [e.term, e.short, e.read, e.what, e.calc.plain, e.example]) {
        expect(typeof f === "string" && f.trim().length > 0).toBe(true);
      }
      expect(e.mistakes.length).toBeGreaterThanOrEqual(1);
      expect(e.related.length).toBeGreaterThanOrEqual(1);
    }
  });

  test("keys match ids, and every related term exists and isn't itself", () => {
    for (const [k, e] of Object.entries(GLOSSARY)) {
      expect(e.id).toBe(k as TermId);
      for (const r of e.related) {
        expect(isTermId(r)).toBe(true);
        expect(r).not.toBe(e.id);
      }
    }
  });

  test("the popover definition fits (≤ 220 characters)", () => {
    for (const e of entries) expect(e.short.length).toBeLessThanOrEqual(220);
  });

  test("every topic has terms, and every term has a known topic", () => {
    for (const t of TOPICS) expect(entries.some((e) => e.topic === t)).toBe(true);
    for (const e of entries) expect(TOPICS).toContain(e.topic);
  });

  test("covers the terms on screen", () => {
    for (const id of ["sma", "ema", "breadth", "net-advances", "mcclellan", "summation-index", "ad-line", "rana", "drawdown", "volume-ratio"]) {
      expect(isTermId(id)).toBe(true);
    }
    for (const id of ["right-now", "bad-days", "crash-episodes"]) expect(isTermId(id)).toBe(true);
    for (const id of ["washout", "episode", "forward-return"]) expect(isTermId(id)).toBe(true);
    for (const id of ["unusual-activity", "big-keeping", "huge-volume", "delivery-pct", "delivery-jump", "delivery-collapse"]) expect(isTermId(id)).toBe(true);
    for (const id of ["top-volume", "value-traded", "size-group", "nse-sector"]) expect(isTermId(id)).toBe(true);
    expect(isTermId("big-price-jump")).toBe(true);
  });

  test("text uses a true minus, never a hyphen before a digit", () => {
    for (const e of entries) {
      const text = [e.short, e.read, e.what, e.calc.plain, e.example, ...e.mistakes].join(" ");
      expect(/(^|[\s(])-\d/.test(text)).toBe(false);
    }
  });

  test("isTermId and termHref", () => {
    expect(isTermId("mcclellan")).toBe(true);
    expect(isTermId("nope")).toBe(false);
    expect(isTermId("__proto__")).toBe(false);
    expect(termHref("net-advances")).toBe("/learn/net-advances");
  });
});

test("todayLine drops placeholders so the popover never says 'Today: —'", () => {
  expect(todayLine("−24: 13 rose, 37 fell")).toBe("−24: 13 rose, 37 fell");
  for (const p of [undefined, "", "  ", "—", "-", "Not enough history", "Not available for today"]) {
    expect(todayLine(p)).toBeNull();
  }
});
