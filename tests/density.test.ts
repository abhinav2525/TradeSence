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

  test("cn() lets a caller override the density spacing tokens", () => {
    expect(cn("px-card-x pb-card", "p-0")).toBe("p-0");
    expect(cn("px-card-x", "px-3")).toBe("px-3");
    expect(cn("px-4 py-cell", "py-2")).toBe("px-4 py-2");
    expect(cn("h-row-head px-4", "h-9")).toBe("px-4 h-9");
    expect(cn("gap-cards", "gap-4")).toBe("gap-4");
    expect(cn("px-4 py-cell", "py-cell pl-card-x pr-3")).toBe("px-4 py-cell pl-card-x pr-3");
  });
  test("the d key is listed in the sidebar shortcuts", () => {
    expect(readFileSync("src/components/SiteNav.tsx", "utf8")).toMatch(/\["t d", "Theme \/ spacing"\]/);
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

describe("spacing follows density", () => {
  test("no fixed 20px card inset left outside the sidebar and button sizes", () => {
    expect(hits(/\b(p|px|pl|pr|pb)-5\b/, ["ui/button.tsx", "SiteNav.tsx"])).toEqual([]);
  });
  test("page grids and tiles use gap-cards", () => {
    const pages = srcFiles("src/app").filter((f) => f.endsWith("page.tsx"));
    expect(pages.flatMap((f) => (/\bgap-4\b/.test(readFileSync(f, "utf8")) ? [f] : []))).toEqual([]);
    expect(readFileSync("src/components/Readout.tsx", "utf8")).toContain("gap-cards");
  });
  test("the gutter from lg is a token", () => {
    const shell = readFileSync("src/components/AppShell.tsx", "utf8");
    expect(shell).toContain("lg:px-gutter");
    expect(shell).not.toContain("lg:px-8");
  });
  test("table rows and headers use the row tokens", () => {
    // every py-2 / py-2.5 in these files is a table cell (cn() calls span lines, so check whole files)
    const tables = ["ScreenerTable", "MemberTable", "CrossingsTable", "AdRecentTable", "ForwardReturns", "EpisodeTable", "CrashTable"];
    for (const t of tables) {
      const src = readFileSync(`src/components/${t}.tsx`, "utf8");
      expect({ t, py2: /\bpy-2(\.5)?\b/.test(src), h9: /\bh-9\b/.test(src) }).toEqual({ t, py2: false, h9: false });
    }
    const table = readFileSync("src/components/ui/table.tsx", "utf8");
    expect(table).toContain("h-row-head");
    expect(table).toContain("py-cell");
  });
  test("every chart height scales with density", () => {
    expect(hits(/<ChartContainer\b/).length).toBeGreaterThanOrEqual(7);
    expect(hits(/<ChartContainer\b[^>]*\bh-\[\d+px\]/)).toEqual([]);
    expect(hits(/h-\[calc\(\d+px\*var\(--density-chart\)\)\]/).length).toBe(8); // + Money flow history
  });
});

describe("hero layout follows density", () => {
  for (const f of ["src/app/page.tsx", "src/app/advance-decline/page.tsx"]) {
    test(`${f}: compact puts the hero full width and four tiles beneath it`, () => {
      const src = readFileSync(f, "utf8");
      expect(src).toContain('className="lg:col-span-12 xl:col-span-7 xl:compact:col-span-12"');
      expect(src).toContain(
        'className="lg:col-span-12 lg:grid-cols-4 xl:col-span-5 xl:grid-cols-2 xl:compact:col-span-12 xl:compact:grid-cols-4"',
      );
    });
  }
});
