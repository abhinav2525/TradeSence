import { test, expect, describe } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import CountUp from "../src/components/CountUp";
import { PREPAINT_SCRIPT } from "../src/lib/prepaint";

describe("CountUp on the server", () => {
  test("the HTML already holds the final figure, for screen readers and no-JS", () => {
    const html = renderToString(createElement(CountUp, { text: "−1,560" }));
    expect(html).toContain("countup");
    expect(html.match(/−1,560/g)!.length).toBe(2); // the sr-only copy and the visible one
  });
  test("copying a figure copies it once: the animated copy can't be selected", () => {
    const html = renderToString(createElement(CountUp, { text: "16" }));
    expect(html).toMatch(/aria-hidden="true" class="select-none"/);
  });
  test("a non-figure renders unchanged", () => {
    expect(renderToString(createElement(CountUp, { text: "—" }))).toContain("—");
  });
});

describe("the pre-paint script", () => {
  const run = (reduced: boolean, theme: string | null) => {
    const attrs: Record<string, string> = {};
    const classes = new Set(["dark"]);
    const document = { documentElement: { classList: { remove: (c: string) => classes.delete(c) }, setAttribute: (k: string, v: string) => { attrs[k] = v; } } };
    const window = { matchMedia: (q: string) => ({ matches: reduced && q.includes("reduce") }) };
    const localStorage = { getItem: () => theme };
    new Function("document", "window", "localStorage", PREPAINT_SCRIPT)(document, window, localStorage);
    return { attrs, classes };
  };
  test("marks the page for motion only when motion is allowed", () => {
    expect(run(false, null).attrs).toHaveProperty("data-motion");
    expect(run(true, null).attrs).not.toHaveProperty("data-motion");
  });
  test("still applies the stored light theme", () => {
    expect(run(false, "light").classes.has("dark")).toBe(false);
    expect(run(false, null).classes.has("dark")).toBe(true);
  });
});
