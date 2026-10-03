// Compiles .design-sync/ds.css with the repo's own Tailwind v4 (PostCSS plugin)
// into .design-sync/.cache/ds.css, the `cssEntry` the converter ships.
// Run from the repo root: node .design-sync/build-css.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const from = ".design-sync/ds.css";
const to = ".design-sync/.cache/ds.css";
const out = await postcss([tailwind()]).process(readFileSync(from, "utf8"), { from, to });
mkdirSync(".design-sync/.cache", { recursive: true });
writeFileSync(to, out.css);
console.log(`wrote ${to} (${(out.css.length / 1024).toFixed(0)} KB)`);
