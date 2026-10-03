import { test, expect, describe } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { cn } from "../src/lib/utils";
import { PREPAINT_SCRIPT } from "../src/lib/prepaint";
import { toggleDensity } from "../src/components/DensityToggle";

// Density (decision 0020): every size the compact/comfortable switch controls is a
// --density-* variable, set once per density, read by named Tailwind tokens.

const srcFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? srcFiles(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
/** file:line for every line in src/ matching `re`, skipping files whose path ends with any of `skip` */
const hits = (re: RegExp, skip: string[] = []) =>
  srcFiles("src")
    .filter((f) => !skip.some((s) => f.endsWith(s)))
    .flatMap((f) => readFileSync(f, "utf8").split("\n").flatMap((l, i) => (re.test(l) ? [`${f}:${i + 1}`] : [])));

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

describe("density before first paint", () => {
  const run = (stored: Record<string, string> | "blocked") => {
    const attrs: Record<string, string> = {};
    const document = { documentElement: { classList: { remove() {} }, setAttribute: (k: string, v: string) => { attrs[k] = v; } } };
    const window = { matchMedia: () => ({ matches: true }) };
    const localStorage = {
      getItem: (k: string) => {
        if (stored === "blocked") throw new Error("blocked");
        return stored[k] ?? null;
      },
    };
    new Function("document", "window", "localStorage", PREPAINT_SCRIPT)(document, window, localStorage);
    return attrs["data-density"];
  };
  test("a stored comfortable choice is applied", () => expect(run({ density: "comfortable" })).toBe("comfortable"));
  test("nothing stored leaves the server's compact alone", () => expect(run({})).toBeUndefined());
  test("junk is ignored", () => expect(run({ density: "wide" })).toBeUndefined());
  test("blocked storage does not throw", () => expect(run("blocked")).toBeUndefined());
  test("layout.tsx renders compact on the server", () => {
    expect(readFileSync("src/app/layout.tsx", "utf8")).toContain('data-density="compact"');
  });
});

describe("toggleDensity", () => {
  test("flips the attribute and remembers it", () => {
    let attr = "compact";
    const saved: Record<string, string> = {};
    const g = globalThis as any;
    g.document = { documentElement: { getAttribute: () => attr, setAttribute: (_: string, v: string) => { attr = v; } } };
    g.localStorage = { setItem: (k: string, v: string) => { saved[k] = v; } };
    try {
      expect(toggleDensity()).toBe("comfortable");
      expect(attr).toBe("comfortable");
      expect(saved.density).toBe("comfortable");
      expect(toggleDensity()).toBe("compact");
      g.localStorage = { setItem: () => { throw new Error("blocked"); } };
      expect(toggleDensity()).toBe("comfortable"); // still switches for this visit
    } finally {
      delete g.document;
      delete g.localStorage;
    }
  });
  test("the d key is wired next to t", () => {
    const src = readFileSync("src/components/Hotkeys.tsx", "utf8");
    expect(src).toContain('e.key === "d"');
    expect(src).toContain("toggleDensity()");
  });
});

describe("body type follows density", () => {
  test("no raw 13px or text-sm left", () => {
    expect(hits(/text-\[13px\]|\btext-sm\b/)).toEqual([]);
  });
});
