import { test, expect, describe } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import ShareTrendCard from "../src/components/ShareTrendCard";
import { shareChange, type ShareYearRow } from "../src/indicators/money-flow";

// What Money flow's "Share of trading over a year" card prints (decision 0041).
const bare = (html: string) => html.replace(/<!-- -->/g, "");
const text = (html: string) => bare(html).replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");
const blocks = { nowFrom: "2026-07-08", nowTo: "2026-10-06", agoFrom: "2025-07-08", agoTo: "2025-10-06" };
const row = (sector: string, now: number, ago: number, fresh = 0): ShareYearRow =>
  ({ sector, stocks: 10, nowTurnover: now, nowTotal: 1000, agoTurnover: ago, agoTotal: 1000, newListingTurnover: fresh });
const render = (props: Parameters<typeof ShareTrendCard>[0]) => text(renderToString(createElement(ShareTrendCard, props)));

describe("ShareTrendCard", () => {
  test("without a year of history: says so, no year-ago column and never a 0%", () => {
    const t = render({ trend: null, blocks: null, lines: new Map(), hrefFor: (s) => s });
    expect(t).toContain("Needs a year of history");
    expect(t).not.toContain("A year ago");
    expect(t).not.toMatch(/\b0(\.0)?%/);
  });

  test("rows: shares, change in pts with its sign, the dates, the new-listing mark and the 100% footnote", () => {
    const trend = shareChange([row("Consumer Durables", 52, 36), row("Consumer Services", 56, 64, 11.2), row("Auto", 72, 92)]);
    const t = render({ trend, blocks, lines: new Map(), hrefFor: (s) => `/money-flow?sector=${s}` });
    expect(t).toContain("Share of trading over a year");
    expect(t).toContain("the last 3 months against the same 3 months a year ago");
    expect(t).toContain("Now: 8 Jul–6 Oct 2026. A year ago: 8 Jul–6 Oct 2025.");
    expect(t).toContain("+1.6 pts");
    expect(t).toContain("−2.0 pts");
    expect(t).toMatch(/Consumer Services .*Partly new listings .*: 20% of its recent trading/);
    expect(t).not.toMatch(/Consumer Durables Partly/);
    // rows 18.0% now, 19.2% a year ago: small sectors are the rest
    expect(t).toContain("together: 82.0% now, 80.8% a year ago");
    expect(t).toContain("today's sector labels");
    expect(t.indexOf("Consumer Durables")).toBeLessThan(t.indexOf("Auto")); // largest gain first
  });

  test("a change that rounds to 0.0 isn't coloured", () => {
    const html = bare(renderToString(createElement(ShareTrendCard, { trend: shareChange([row("Textiles", 49.02, 49)]), blocks, lines: new Map(), hrefFor: (s) => s })));
    expect(html).toMatch(/text-muted-foreground[^"]*">\+?0\.0 pts/);
    expect(html).not.toMatch(/text-up[^"]*">\+0\.0 pts/);
  });
});
