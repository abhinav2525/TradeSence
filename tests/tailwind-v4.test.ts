import { test, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") || p.endsWith(".ts") ? [p] : [];
  });
}

// Tailwind v4 silently ignores the v3 form `utility-[--var]`; it must be `utility-(--var)`
// (decisions 0010, 0016). `[--name:value]` (setting a variable) is valid v4 and allowed.
test("no Tailwind v3 `utility-[--var]` classes anywhere in src", () => {
  const hits = files("src").flatMap((f) =>
    readFileSync(f, "utf8").split("\n").flatMap((line, i) => (/[a-z0-9]-\[--[\w-]+\]/.test(line) ? [`${f}:${i + 1}`] : [])),
  );
  expect(hits).toEqual([]);
});
