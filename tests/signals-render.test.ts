import { test, expect, describe } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import EpisodeTable from "../src/components/EpisodeTable";
import WashoutCard from "../src/components/WashoutCard";
import type { Episode, Washout } from "../src/indicators/signals";

// What the Signals page actually prints for Nifty Bank vs the NIFTY 50 (decision 0035).
const ep: Episode = {
  start: "2022-06-09", last: "2022-06-20", extreme: 100 / 12, sessions: 8, extremeAbove: 1, extremeTotal: 12,
  returns: { "1m": 2.1, "3m": 9.4, "6m": 15.2 }, pending: { "1m": false, "3m": false, "6m": false },
};
const washout: Washout = { status: "quiet", pct: 50, date: "2026-10-05", since: null, lastStart: "2025-02-21", fired: 7, above: 7, total: 14 };
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");

describe("EpisodeTable", () => {
  test("an untested index reads as a count, with no summary wording", () => {
    const t = text(renderToString(createElement(EpisodeTable, { cond: "under", episodes: [ep], first: "2020-01-01", indexLabel: "Nifty Bank", tested: false })));
    expect(t).toContain("Fewest above");
    expect(t).toContain("1 of 12");
    expect(t).not.toMatch(/median|higher in/i);
    expect(t).not.toContain("8%");
  });
  test("the NIFTY 50 keeps the share", () => {
    const t = text(renderToString(createElement(EpisodeTable, { cond: "under", episodes: [ep], first: "2020-01-01" })));
    expect(t).toContain("Lowest share above");
    expect(t).toContain("8%");
    expect(t).not.toContain("1 of 12");
  });
});

describe("WashoutCard note", () => {
  test("an untested index says how many points one member moves", () => {
    const t = text(renderToString(createElement(WashoutCard, { washout, recent: [], first: "2020-01-01", indexLabel: "Nifty Bank", tested: false })));
    expect(t).toContain("With 14 members, one moves Nifty Bank's share by about 7 points.");
    expect(t).toContain("7 of Nifty Bank's 14 members");
  });
  test("the NIFTY 50 keeps its study note", () => {
    const t = text(renderToString(createElement(WashoutCard, { washout, recent: [], first: "2020-01-01" })));
    expect(t).toContain("our study of past washouts found a pattern");
    expect(t).not.toContain("points");
  });
});
