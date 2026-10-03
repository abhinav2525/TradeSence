import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { cn } from "../src/lib/utils";

// Density (decision 0020): every size the compact/comfortable switch controls is a
// --density-* variable, set once per density, read by named Tailwind tokens.

const css = readFileSync("src/app/globals.css", "utf8");
const block = (sel: string) => {
  const i = css.indexOf(sel);
  expect(i).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf("}", i));
};
const compactBlock = () => block(':root,\n[data-density="compact"] {');
const comfortableBlock = () => block('[data-density="comfortable"] {');
const VARS = [
  "--density-display", "--density-metric", "--density-metric-lh", "--density-body", "--density-body-lh",
  "--density-body-sm", "--density-body-sm-lh", "--density-card-x", "--density-card-y", "--density-cards",
  "--density-gutter", "--density-row-head", "--density-cell-y", "--density-chart",
];

describe("density tokens", () => {
  test("every density variable is set for both compact and comfortable", () => {
    const compact = compactBlock();
    const comfortable = comfortableBlock();
    for (const v of VARS) {
      expect({ v, compact: compact.includes(`${v}:`) }).toEqual({ v, compact: true });
      expect({ v, comfortable: comfortable.includes(`${v}:`) }).toEqual({ v, comfortable: true });
    }
  });

  test("compact holds the brief's numbers; comfortable holds today's", () => {
    const compact = compactBlock();
    const comfortable = comfortableBlock();
    expect(compact).toContain("--density-display: 3rem;");
    expect(compact).toContain("--density-metric: 1.375rem;");
    expect(compact).toContain("--density-body: 0.8125rem;");
    expect(compact).toContain("--density-body-sm: 0.75rem;");
    expect(compact).toContain("--density-chart: 0.7;");
    expect(comfortable).toContain("--density-display: 4rem;");
    expect(comfortable).toContain("--density-body-sm: 0.8125rem;");
    expect(comfortable).toContain("--density-chart: 1;");
  });

  test("the theme tokens read the density variables", () => {
    for (const t of [
      "--text-display: var(--density-display)", "--text-body: var(--density-body)",
      "--text-body-sm: var(--density-body-sm)", "--spacing-card-x: var(--density-card-x)",
      "--spacing-cards: var(--density-cards)", "--spacing-row-head: var(--density-row-head)",
    ]) {
      expect(css).toContain(t);
    }
    expect(css).toMatch(/@custom-variant compact /);
    expect(css).toMatch(/@custom-variant comfortable /);
  });

  test("cn() knows the new type sizes", () => {
    expect(cn("text-body-sm", "text-foreground")).toBe("text-body-sm text-foreground");
    expect(cn("text-body-sm", "text-[12px]")).toBe("text-[12px]");
    expect(cn("text-body", "text-body-sm")).toBe("text-body-sm");
  });
});
