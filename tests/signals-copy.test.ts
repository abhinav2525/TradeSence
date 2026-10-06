import { test, expect, describe } from "bun:test";
import {
  UNTESTED_LINE, signalsView, washoutNote, firedLine, noticeText, noticeVisible, pctText, readingSentence, toneClass, washoutSentence,
} from "../src/components/signals-copy";
import type { Episode, HorizonSummary, Washout } from "../src/indicators/signals";
import { NIFTY50, NIFTY_BANK } from "../src/ingest/indices";

const w = (over: Partial<Washout>): Washout =>
  ({ status: "active", pct: 16, date: "2026-10-01", since: "2026-10-01", lastStart: "2026-10-01", fired: 6, ...over });
const h = (key: "1m" | "3m" | "6m", over: Partial<HorizonSummary>): HorizonSummary =>
  ({ key, label: key, n: 5, median: 5, higher: 5, best: 9, worst: 1, baseline: 1, ...over });
const ep = (start: string, oneMonth: number | null): Episode => ({
  start, last: start, extreme: 18, sessions: 1,
  returns: { "1m": oneMonth, "3m": 5, "6m": 10 },
  pending: { "1m": oneMonth === null, "3m": false, "6m": false },
});

describe("washoutSentence", () => {
  test("Active names the start", () => {
    expect(washoutSentence(w({}))).toBe("16% of NIFTY 50 stocks are above their 200-day SMA, under the 20% line. This washout began on 1 Oct 2026.");
  });
  test("Watching says how far above the line; exactly on it is not under it", () => {
    expect(washoutSentence(w({ status: "watching", pct: 22, since: null }))).toBe("22% of NIFTY 50 stocks are above their 200-day SMA, 2 pts above the 20% line.");
    expect(washoutSentence(w({ status: "watching", pct: 20, since: null }))).toBe("20% of NIFTY 50 stocks are above their 200-day SMA, right on the 20% line but not under it.");
  });
  test("Quiet", () => {
    expect(washoutSentence(w({ status: "quiet", pct: 48, since: null }))).toBe("48% of NIFTY 50 stocks are above their 200-day SMA, well clear of the 20% line.");
  });
});

describe("firedLine", () => {
  test("active, past and never", () => {
    expect(firedLine(w({}), "2020-01-01")).toBe("6 washouts since 2020 · this one began 1 Oct 2026");
    expect(firedLine(w({ status: "quiet", since: null, lastStart: "2025-04-07", fired: 1 }), "2020-01-01")).toBe("1 washout since 2020 · last began 7 Apr 2025");
    expect(firedLine(w({ status: "quiet", since: null, lastStart: null, fired: 0 }), "2020-01-01")).toBe("No washout since 1 Jan 2020");
  });
});

describe("readingSentence", () => {
  const hs = [h("1m", { median: 4.5, higher: 4 }), h("3m", { median: 10.9, baseline: 3.4 }), h("6m", { median: 13.6, baseline: 7.7 })];
  const eps = [ep("2020-03-09", -13.9), ep("2022-05-12", 2.5), ep("2022-06-16", 4.5), ep("2025-02-24", 4.6), ep("2025-04-07", 12.5), ep("2026-10-01", null)];

  test("under 20%: six-month record, beat, first-month losses by date, sample size", () => {
    expect(readingSentence("under", hs, eps)).toBe(
      "All 5 washouts with six months behind them had the index higher six months after they began, and the median beat an ordinary day at every horizon. The first month was lower once (9 Mar 2020). Only 5 washouts so far: a small sample.",
    );
  });
  test("under 20%: not all higher, not beating", () => {
    const mixed = [h("1m", { median: 0.5, baseline: 1 }), h("3m", {}), h("6m", { higher: 3 })];
    expect(readingSentence("under", mixed, eps.slice(1, 5))).toBe(
      "3 of 5 washouts were higher six months on. The first month was higher every time. Only 5 washouts so far: a small sample.",
    );
  });
  test("over 80%: says it is not an alarm", () => {
    const o = [h("1m", { n: 8 }), h("3m", { n: 8 }), h("6m", { n: 8, higher: 4, median: -0.4, baseline: 7.7 })];
    expect(readingSentence("over", o, [])).toBe(
      "Six months after breadth went over 80%, the index was higher in 4 of 8, a median of −0.4% against +7.7% on an ordinary day. The study behind this page found no edge here, so it is not an alarm. Only 8 over-80% episodes so far: a small sample.",
    );
  });
  test("nothing has played out yet", () => {
    expect(readingSentence("under", [h("1m", { n: 0 }), h("3m", { n: 0 }), h("6m", { n: 0 })], [])).toBe("No washout has had a month to play out yet.");
  });
});

describe("home notice", () => {
  test("text uses the live counts", () => {
    expect(noticeText(h("6m", { n: 5, higher: 5 }))).toBe("under 20% of NIFTY 50 stocks are above their 200-day SMA. After each of the 5 earlier washouts, the index was higher 6 months later.");
    expect(noticeText(h("6m", { n: 6, higher: 5 }))).toBe("under 20% of NIFTY 50 stocks are above their 200-day SMA. After 5 of the 6 earlier washouts, the index was higher 6 months later.");
    expect(noticeText(h("6m", { n: 0, higher: 0 }))).toBe("under 20% of NIFTY 50 stocks are above their 200-day SMA.");
  });
  test("visible only when Active and showing the latest session", () => {
    expect(noticeVisible("active", "2026-10-01", "2026-10-01")).toBe(true);
    expect(noticeVisible("active", "2025-03-03", "2026-10-01")).toBe(false); // a past date
    expect(noticeVisible("watching", "2026-10-01", "2026-10-01")).toBe(false); // exactly 20%
    expect(noticeVisible(undefined, null, undefined)).toBe(false);
  });
});

test("pctText and toneClass", () => {
  expect(pctText(14.12)).toBe("+14.1%");
  expect(pctText(-6.1)).toBe("−6.1%");
  expect(pctText(null)).toBe("—");
  expect(toneClass(2)).toBe("text-up");
  expect(toneClass(-2)).toBe("text-down");
  expect(toneClass(0.01)).toBe("text-foreground-2");
  expect(toneClass(null)).toBe("text-foreground-2");
});

describe("Nifty Bank wording (decision 0035)", () => {
  test("the count of members, then the share; same line, same states", () => {
    expect(washoutSentence(w({ pct: (2 / 14) * 100, above: 2, total: 14 }), "Nifty Bank")).toBe(
      "2 of Nifty Bank's 14 members are above their 200-day SMA (14%), under the 20% line. This washout began on 1 Oct 2026.",
    );
    expect(washoutSentence(w({ status: "watching", pct: (3 / 14) * 100, above: 3, total: 14, since: null }), "Nifty Bank")).toBe(
      "3 of Nifty Bank's 14 members are above their 200-day SMA (21%), 1 pts above the 20% line.",
    );
  });
  test("the NIFTY 50 sentence is unchanged when the label is given", () => {
    expect(washoutSentence(w({}), "NIFTY 50")).toBe(washoutSentence(w({})));
  });
  test("the untested line, word for word", () => {
    expect(UNTESTED_LINE).toBe("Same 20% line as the NIFTY 50 alarm; never tested on this index; several episodes are the same sell-off.");
  });
  test("no rare or percentile wording", () => {
    const all = [washoutSentence(w({ above: 2, total: 14 }), "Nifty Bank"), UNTESTED_LINE].join(" ");
    expect(all).not.toMatch(/rare|percentile|median/i);
  });
});

describe("Signals review fixes (decision 0035)", () => {
  test("the NIFTY 50 keeps the share wording even when the day carries counts", () => {
    expect(washoutSentence(w({ pct: 16, above: 8, total: 50 }), "NIFTY 50")).toBe(
      "16% of NIFTY 50 stocks are above their 200-day SMA, under the 20% line. This washout began on 1 Oct 2026.",
    );
  });
  test("signalsView: Nifty Bank shows washout rows only; the NIFTY 50 keeps summaries and the chosen side", () => {
    expect(signalsView(NIFTY_BANK, "over")).toEqual({ summaries: false, tableCond: "under" });
    expect(signalsView(NIFTY_BANK, "under")).toEqual({ summaries: false, tableCond: "under" });
    expect(signalsView(NIFTY50, "over")).toEqual({ summaries: true, tableCond: "over" });
    expect(signalsView(NIFTY50, "under")).toEqual({ summaries: true, tableCond: "under" });
  });
  test("washoutNote: one member's weight in points, from the day's own count", () => {
    expect(washoutNote("Nifty Bank", 14)).toBe("Only the 200-day SMA, as in the NIFTY 50 alarm. With 14 members, one moves Nifty Bank's share by about 7 points.");
    expect(washoutNote("Nifty Bank", 12)).toBe("Only the 200-day SMA, as in the NIFTY 50 alarm. With 12 members, one moves Nifty Bank's share by about 8 points.");
    expect(washoutNote("Nifty Bank", undefined)).toBe("Only the 200-day SMA, as in the NIFTY 50 alarm.");
  });
});
