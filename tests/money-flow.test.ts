import { test, expect, describe } from "bun:test";
import type { History } from "../src/indicators/history";
import {
  HISTORY_WEEKS, MIN_NORMAL, NORMAL_SESSIONS, cleanFlowPeriod, cleanSector, marketTotals, shortSessions, weekWindows, weeklySectorFlows, flowStats, flowWindows, sectorFlows, sectorStocks, type FlowRow,
} from "../src/indicators/money-flow";

/** n weekday sessions from 2026-01-01; `over` replaces whole columns. */
function hist(n: number, over: Partial<Record<keyof History, unknown[]>> = {}): History {
  const dates: string[] = [];
  const d = new Date("2026-01-01T00:00:00Z");
  while (dates.length < n) {
    if (d.getUTCDay() % 6 !== 0) dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const fill = <T,>(v: T) => dates.map(() => v);
  return {
    dates, open: fill(100), high: fill(101), low: fill(99), close: fill(100), volume: fill(1000),
    turnover: fill(1e7), factors: fill(1), shareFactors: fill(1), traded: fill(null), delivered: fill(null), ...over,
  } as History;
}
const newestFirst = (h: History) => [...h.dates].reverse();

describe("flowWindows", () => {
  test("window = last P sessions; normal = the 63 before it, never overlapping", () => {
    const h = hist(100);
    const days = newestFirst(h);
    const w = flowWindows(days)!;
    expect(w.asOf).toBe(days[0]);
    expect(w.starts[5]).toBe(days[4]);
    expect(w.normalTo[5]).toBe(days[5]);
    expect(w.normalFrom[5]).toBe(days[5 + NORMAL_SESSIONS - 1]);
    expect(w.normalTo[5] < w.starts[5]).toBe(true);
  });
  test("too few sessions for the longest window plus its normal: null", () => {
    expect(flowWindows(newestFirst(hist(21 + NORMAL_SESSIONS - 1)))).toBeNull();
    expect(flowWindows(newestFirst(hist(21 + NORMAL_SESSIONS)))).not.toBeNull();
  });
});

describe("flowStats", () => {
  test("turnover over the window, normal = mean per traded session before it", () => {
    // last 5 sessions trade ₹3 cr a day, everything before ₹1 cr
    const h = hist(100, { turnover: Array.from({ length: 100 }, (_, i) => (i >= 95 ? 3e7 : 1e7)) });
    const s = flowStats(h, flowWindows(newestFirst(h))!).find((x) => x.period === 5)!;
    expect(s.turnover).toBe(15e7);
    expect(s.normalDaily).toBe(1e7);
    expect(s.sessions).toBe(5);
  });
  test(`a normal needs ${MIN_NORMAL} traded sessions of the 63`, () => {
    const full = hist(100);
    const w = flowWindows(newestFirst(full))!;
    // keep the last 5 + only 39 (then 40) sessions of the normal window
    const keep = (k: number) => {
      const idx = [...Array.from({ length: k }, (_, j) => 94 - j), 95, 96, 97, 98, 99].sort((a, b) => a - b);
      const pick = <T,>(a: T[]) => idx.map((i) => a[i]!);
      return { ...full, dates: pick(full.dates), open: pick(full.open), high: pick(full.high), low: pick(full.low), close: pick(full.close),
        volume: pick(full.volume), turnover: pick(full.turnover), factors: pick(full.factors), shareFactors: pick(full.shareFactors),
        traded: pick(full.traded), delivered: pick(full.delivered) } as History;
    };
    expect(flowStats(keep(MIN_NORMAL - 1), w).find((x) => x.period === 5)!.normalDaily).toBeNull();
    expect(flowStats(keep(MIN_NORMAL), w).find((x) => x.period === 5)!.normalDaily).toBe(1e7);
  });
  test("price move on adjusted closes; none if the stock missed the latest session", () => {
    const close = Array.from({ length: 100 }, (_, i) => (i >= 95 ? 220 : 100));
    const factors = Array.from({ length: 100 }, (_, i) => (i >= 95 ? 1 : 0.5)); // a 2:1 consolidation before the window
    const h = hist(100, { close, factors });
    const w = flowWindows(newestFirst(h))!;
    expect(flowStats(h, w).find((x) => x.period === 5)!.changePct).toBeCloseTo(10, 9); // 200 adjusted → 220
    const missed = { ...h, dates: h.dates.slice(0, 99), close: close.slice(0, 99), factors: factors.slice(0, 99), turnover: h.turnover.slice(0, 99) } as History;
    expect(flowStats(missed, w).find((x) => x.period === 5)!.changePct).toBeNull();
  });
});

const row = (symbol: string, sector: string, turnover: number, normalDaily: number | null, changePct: number | null): FlowRow =>
  ({ symbol, sector, turnover, normalDaily, changePct });

describe("sectorFlows", () => {
  const rows: FlowRow[] = [
    ...["A", "B", "C", "D", "E"].map((s, i) => row(s, "Metals", 20e7, 2e7, i < 3 ? 2 : -1)), // 2× normal over 5 sessions
    row("F", "Metals", 5e7, null, 4), // new listing: share yes, ratio no
    ...["G", "H", "I", "J", "K"].map((s) => row(s, "IT", 5e7, 2e7, -3)), // 0.5×
    ...["L", "M", "N", "O"].map((s) => row(s, "Utilities", 1e7, 1e6, 0)), // under 5 stocks
  ];
  const { sectors, small } = sectorFlows(rows, 5);
  test("ratio over stocks with a normal; sorted busiest first", () => {
    expect(sectors.map((x) => x.sector)).toEqual(["Metals", "IT"]);
    expect(sectors[0]!.ratio).toBeCloseTo(100e7 / 50e7, 12);
    expect(sectors[1]!.ratio).toBeCloseTo(0.5, 12);
  });
  test("share of all trading (small sectors count in the total) vs usual", () => {
    const total = 105e7 + 25e7 + 4e7;
    expect(sectors[0]!.share).toBeCloseTo(105e7 / total, 12);
    expect(sectors[0]!.usualShare).toBeCloseTo(10e7 / (10e7 + 10e7 + 4e6), 12);
  });
  test("median move and rising/falling counts", () => {
    expect(sectors[0]!.medianMove).toBe(2);
    expect([sectors[0]!.up, sectors[0]!.down]).toEqual([4, 2]);
  });
  test("sectors under 5 stocks are named, not drawn", () => {
    expect(small).toEqual(["Utilities"]);
  });
  test("a sector with no normals has no ratio, sorts last, never NaN", () => {
    const r = sectorFlows([...rows, ...["P", "Q", "R", "S", "T"].map((s) => row(s, "Power", 1e7, null, 1))], 5).sectors;
    expect(r.at(-1)!.sector).toBe("Power");
    expect(r.at(-1)!.ratio).toBeNull();
  });
});

describe("sectorStocks", () => {
  test("stocks by extra ₹ above their normal; no normal sorts last", () => {
    const rows = [row("A", "IT", 20e7, 2e7, 1), row("B", "IT", 30e7, 1e7, 1), row("C", "IT", 50e7, null, 1), row("D", "Metals", 99e7, 1e7, 1)];
    const r = sectorStocks(rows, "IT", 5);
    expect(r.map((x) => x.symbol)).toEqual(["B", "A", "C"]);
    expect(r[0]!.extra).toBe(25e7);
    expect(r[0]!.ratio).toBe(6);
    expect(r[2]!.extra).toBeNull();
    expect(sectorStocks(rows, "IT", 5, 1).length).toBe(1);
  });
});

describe("cleanFlowPeriod", () => {
  test("1, 5, 21 accepted; anything else is 1 week", () => {
    expect([cleanFlowPeriod("1"), cleanFlowPeriod("21"), cleanFlowPeriod("5")]).toEqual([1, 21, 5]);
    for (const v of [undefined, "", "63", "5;drop", " 1", "21.0"]) expect(cleanFlowPeriod(v)).toBe(5);
  });
});

describe("review fixes", () => {
  test("a stock that didn't trade in the window is left out of the sector's ratio", () => {
    const rows: FlowRow[] = [
      ...["A", "B", "C", "D", "E"].map((s) => row(s, "IT", 10e7, 2e7, 1)), // 1.0× over 5 sessions
      row("F", "IT", 0, 50e7, null), // suspended: has a normal, traded nothing
    ];
    expect(sectorFlows(rows, 5).sectors[0]!.ratio).toBeCloseTo(1, 12);
  });
  test("cleanSector: only a sector we hold, exactly", () => {
    const held = ["Financial Services", "Metals & Mining"];
    expect(cleanSector("Metals & Mining", held)).toBe("Metals & Mining");
    for (const v of [undefined, "", "metals & mining", "Metals & Mining ", "x' or 1=1"]) expect(cleanSector(v, held)).toBeNull();
  });
  test("shortSessions: market-wide trading under half the usual day is flagged", () => {
    const totals = Array.from({ length: 70 }, (_, i) => ({ date: `d${String(i).padStart(2, "0")}`, turnover: 100 }));
    totals[69] = { date: "d69", turnover: 15 }; // a Muhurat evening
    totals[67] = { date: "d67", turnover: 60 }; // a quiet day, not short
    expect(shortSessions(totals)).toEqual(["d69"]);
    expect(shortSessions(totals.slice(0, 10))).toEqual([]); // too little history to judge
  });
});

describe("weekly history", () => {
  const sessions = (n: number) => newestFirst(hist(n));
  test("week 0 is exactly the 1-week window; weeks don't overlap; each normal follows its week", () => {
    const days = sessions(400);
    const wk = weekWindows(days);
    const w = flowWindows(days)!;
    expect(wk).toHaveLength(HISTORY_WEEKS);
    expect(wk[0]).toEqual({ end: days[0], start: w.starts[5], normalTo: w.normalTo[5], normalFrom: w.normalFrom[5] });
    for (let k = 1; k < wk.length; k++) {
      expect(wk[k]!.end < wk[k - 1]!.start).toBe(true);
      expect(wk[k]!.normalTo < wk[k]!.start).toBe(true);
    }
  });
  test("only weeks with a full normal window", () => {
    expect(weekWindows(sessions(10 * 5 + NORMAL_SESSIONS))).toHaveLength(10);
    expect(weekWindows(sessions(10 * 5 + NORMAL_SESSIONS - 1))).toHaveLength(9);
  });
  test("week 0 of a sector equals the bars' 1-week reading", () => {
    const stocks = ["A", "B", "C", "D", "E"].map((symbol, j) => ({
      symbol, sector: "IT",
      h: hist(400, { turnover: Array.from({ length: 400 }, (_, i) => (i >= 395 ? 3e7 : 1e7 + j * 1e6)),
        close: Array.from({ length: 400 }, (_, i) => (i >= 395 ? 110 : 100)) }),
    }));
    const days = newestFirst(stocks[0]!.h);
    const weeks = weeklySectorFlows(stocks, weekWindows(days), new Set(), null);
    const bar = sectorFlows(stocks.map((s) => ({ symbol: s.symbol, sector: s.sector, ...flowStats(s.h, flowWindows(days)!).find((x) => x.period === 5)! })), 5).sectors[0]!;
    const w0 = weeks.find((x) => x.weekEnd === days[0])!;
    expect(w0.ratio).toBeCloseTo(bar.ratio!, 12);
    expect(w0.medianMove).toBeCloseTo(bar.medianMove!, 12);
    expect(w0.stocks).toBe(5);
    expect(weeks.filter((x) => x.sector === "IT")).toHaveLength(HISTORY_WEEKS);
  });
  test("a week containing a short session is marked", () => {
    const stocks = ["A", "B", "C", "D", "E"].map((symbol) => ({ symbol, sector: "IT", h: hist(400) }));
    const days = newestFirst(stocks[0]!.h);
    const weeks = weeklySectorFlows(stocks, weekWindows(days), new Set([days[7]!]), null);
    expect(weeks.find((x) => x.weekEnd === days[5])!.shortSession).toBe(true);
    expect(weeks.find((x) => x.weekEnd === days[0])!.shortSession).toBe(false);
  });
  test("marketTotals sums every stock per session, oldest first, from a date", () => {
    const a = hist(5), b = hist(5, { turnover: Array(5).fill(2e7) });
    const t = marketTotals([a, b], a.dates[2]!);
    expect(t).toEqual(a.dates.slice(2).map((date) => ({ date, turnover: 3e7 })));
  });
});

// ── Loudest stock and busier count (spec 2026-10-07) ──
import { BUSY_SECTOR_FEW, cleanLoud, marketBusier, normalDaily, shownRatio, sortSectors } from "../src/indicators/money-flow";

describe("normalDaily (one rule for Money flow and Top volume)", () => {
  test("mean ₹ per traded session in [from, to]; null under 40 traded sessions", () => {
    const h = hist(100, { turnover: Array.from({ length: 100 }, (_, i) => (i < 50 ? 1e7 : 3e7)) });
    expect(normalDaily(h, h.dates[30]!, h.dates[69]!)).toBe((20 * 1e7 + 20 * 3e7) / 40); // 40 sessions: has a normal
    expect(normalDaily(h, h.dates[30]!, h.dates[68]!)).toBeNull(); // 39 sessions: none
  });
  test("flowStats' normal is normalDaily over flowWindows' normal span", () => {
    const h = hist(100, { turnover: Array.from({ length: 100 }, (_, i) => 1e7 + i * 1e5) });
    const w = flowWindows(newestFirst(h))!;
    for (const s of flowStats(h, w)) expect(s.normalDaily).toBe(normalDaily(h, w.normalFrom[s.period], w.normalTo[s.period]));
  });
});

describe("sectorFlows: busier count and loudest stock", () => {
  // period 5: normal 1e7 a day → 5e7 expected
  const media: FlowRow[] = [
    row("SUNTV", "Media", 50e7, 1e7, 1), // +45e7 extra: louder than the whole sector's +36e7
    row("B", "Media", 6e7, 1e7, 1), // busier, +1e7
    row("C", "Media", 5e7, 1e7, 1), // exactly at normal: not busier
    row("D", "Media", 3e7, 1e7, 1),
    row("E", "Media", 3e7, 1e7, 1),
    row("F", "Media", 3e7, 1e7, 1),
    row("G", "Media", 0, 1e7, null), // suspended: not counted
    row("H", "Media", 9e7, null, 1), // too new for a normal: not counted
  ];
  test("b of n busier: strict above normal, n = stocks with a normal that traded", () => {
    const m = sectorFlows(media, 5).sectors[0]!;
    expect(m.counted).toBe(6);
    expect(m.busier).toBe(2);
  });
  test("one stock's extra bigger than the sector's: ratio above 1, without it below 1", () => {
    const m = sectorFlows(media, 5).sectors[0]!;
    expect(m.loudest).toBe("SUNTV");
    expect(m.ratio!).toBeCloseTo(70e7 / 30e7, 9);
    expect(m.ratioWithoutLoudest!).toBeCloseTo(20e7 / 25e7, 9);
    expect(m.ratio! > 1 && m.ratioWithoutLoudest! < 1).toBe(true);
  });
  test("loudest ties break on symbol, A first", () => {
    const rows = ["Z", "A", "M", "Q", "R"].map((s) => row(s, "IT", s === "Z" || s === "A" ? 7e7 : 5e7, 1e7, 1));
    expect(sectorFlows(rows, 5).sectors[0]!.loudest).toBe("A");
  });
  test("no stock above its normal: no loudest, and the without-ratio is the ratio", () => {
    const rows = ["A", "B", "C", "D", "E"].map((s, i) => row(s, "IT", (i === 0 ? 5e7 : 4e7), 1e7, 1));
    const s = sectorFlows(rows, 5).sectors[0]!;
    expect(s.loudest).toBeNull();
    expect(s.busier).toBe(0);
    expect(s.ratioWithoutLoudest).toBe(s.ratio);
  });
  test("a 5-stock sector is still shown; nothing left after removal → null", () => {
    // four stocks have no normal: only one counted, and it is the loudest
    const rows = ["A", "B", "C", "D", "E"].map((s, i) => row(s, "IT", 9e7, i === 0 ? 1e7 : null, 1));
    const s = sectorFlows(rows, 5).sectors[0]!;
    expect(s.stocks).toBe(5);
    expect(s.counted).toBe(1);
    expect(s.loudest).toBe("A");
    expect(s.ratioWithoutLoudest).toBeNull();
    expect(s.counted <= BUSY_SECTOR_FEW).toBe(true);
  });
  test("taking out the biggest mover can raise a sector's figure (why the page says 'usually')", () => {
    // A is 10× but small; B is 2× with the most extra rupees
    const rows = [row("A", "IT", 50e7, 1e7, 1), row("B", "IT", 2000e7, 200e7, 1),
      ...["C", "D", "E"].map((s) => row(s, "IT", 5e7, 1e7, 1))];
    const s = sectorFlows(rows, 5).sectors[0]!;
    expect(s.loudest).toBe("B");
    expect(s.ratioWithoutLoudest! > s.ratio!).toBe(true);
  });
});

describe("sortSectors and shownRatio (the 'Hide the loudest stock' toggle)", () => {
  const rows: FlowRow[] = [
    ...["SUNTV", "B", "C", "D", "E"].map((s) => row(s, "Media", s === "SUNTV" ? 60e7 : 4e7, 1e7, 1)), // 3.04× → 0.8×
    ...["P", "Q", "R", "S", "T"].map((s) => row(s, "Power", 6e7, 1e7, 1)), // 1.2× → 1.2×
  ];
  test("off: today's order by ratio; on: by the ratio without the loudest", () => {
    const { sectors } = sectorFlows(rows, 5);
    expect(sectors.map((s) => s.sector)).toEqual(["Media", "Power"]);
    expect(sortSectors(sectors, false).map((s) => s.sector)).toEqual(["Media", "Power"]);
    expect(sortSectors(sectors, true).map((s) => s.sector)).toEqual(["Power", "Media"]);
    expect(shownRatio(sectors.find((s) => s.sector === "Media")!, true)!).toBeCloseTo(0.8, 9);
    expect(shownRatio(sectors.find((s) => s.sector === "Media")!, false)!).toBeCloseTo(76 / 25, 9);
  });
  test("sortSectors doesn't reorder its input", () => {
    const { sectors } = sectorFlows(rows, 5);
    sortSectors(sectors, true);
    expect(sectors.map((s) => s.sector)).toEqual(["Media", "Power"]);
  });
});

describe("marketBusier (whole market's count above the sectors)", () => {
  test("every stock with a normal that traded, small sectors included; strict above normal", () => {
    const rows = [row("A", "IT", 6e7, 1e7, 1), row("B", "IT", 5e7, 1e7, 1), row("C", "Tiny", 9e7, 1e7, 1),
      row("D", "IT", 0, 1e7, null), row("E", "IT", 9e7, null, 1)];
    expect(marketBusier(rows, 5)).toEqual({ busier: 2, counted: 3 });
  });
});

describe("cleanLoud", () => {
  test("exactly 'hide' turns it on; anything else is off", () => {
    expect(cleanLoud("hide")).toBe(true);
    for (const v of [undefined, "", "HIDE", "1", "true", "hide "]) expect(cleanLoud(v)).toBe(false);
  });
});

// ── Share of trading over a year (spec 2026-10-07-sector-share-of-trading, decision 0041) ──
import {
  DEMERGER_MARK, NEW_LISTING_MARK, SHARE_BLOCK_SESSIONS, newListings, sectorShareYear, shareBlocks, shareChange, yearBefore, type ShareYearRow,
} from "../src/indicators/money-flow";
import { NOISE_PCT } from "../src/indicators/risk";

/** Weekday sessions between two dates inclusive, newest first. */
function weekdaysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  while (d.toISOString().slice(0, 10) <= to) {
    if (d.getUTCDay() % 6 !== 0) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out.reverse();
}

describe("shareBlocks: the last 63 sessions against the same calendar span a year earlier", () => {
  test("yearBefore shifts the calendar date; 29 Feb becomes 28 Feb", () => {
    expect(yearBefore("2026-10-06")).toBe("2025-10-06");
    expect(yearBefore("2024-02-29")).toBe("2023-02-28");
    expect(yearBefore("2025-03-01")).toBe("2024-03-01");
  });
  test("pinned dates: 6 Oct 2026 → now 7 Jul–6 Oct 2026, a year ago 7 Jul–6 Oct 2025", () => {
    // 2026-07-07 to 2026-10-06 is exactly 66 weekdays; drop 3 as holidays to get 63 sessions
    const holidays = new Set(["2026-08-14", "2026-08-27", "2026-10-02"]);
    const days = weekdaysBetween("2025-01-01", "2026-10-06").filter((d) => !holidays.has(d));
    const b = shareBlocks(days)!;
    expect(b).toEqual({ nowFrom: "2026-07-07", nowTo: "2026-10-06", agoFrom: "2025-07-07", agoTo: "2025-10-06" });
    expect(days.indexOf(b.nowFrom)).toBe(SHARE_BLOCK_SESSIONS - 1);
  });
  test("needs a year of history: null when the session list doesn't reach before the year-ago block", () => {
    const days = weekdaysBetween("2025-08-01", "2026-10-06");
    expect(shareBlocks(days)).toBeNull(); // year-ago block would start in early July 2025: not held
    expect(shareBlocks(days.slice(0, 62))).toBeNull(); // fewer than 63 sessions
  });
  test("null when no session falls inside the year-ago span", () => {
    const now = weekdaysBetween("2026-07-01", "2026-10-06");
    const old = weekdaysBetween("2024-01-01", "2024-03-01");
    expect(shareBlocks([...now, ...old])).toBeNull();
  });
});

/** A history on these sessions (oldest first) with ₹ per session from `rupees(date)`; sessions with 0 ₹ are left out. */
function histOn(datesAsc: string[], rupees: (d: string) => number): History {
  const dates = datesAsc.filter((d) => rupees(d) > 0);
  const fill = <T,>(v: T) => dates.map(() => v);
  return {
    dates, open: fill(100), high: fill(101), low: fill(99), close: fill(100), volume: fill(1000),
    turnover: dates.map(rupees), factors: fill(1), shareFactors: fill(1), traded: fill(null), delivered: fill(null),
  };
}

describe("sectorShareYear and shareChange", () => {
  const days = weekdaysBetween("2025-01-01", "2026-10-06");
  const asc = [...days].reverse();
  const b = shareBlocks(days)!;
  const inNow = (d: string) => d >= b.nowFrom && d <= b.nowTo;
  const inAgo = (d: string) => d >= b.agoFrom && d <= b.agoTo;

  test("pooled ₹, not the mean of weekly shares: one huge week counts by its size", () => {
    // IT: 5 stocks. In the now block, IT trades 1 crore a day except one week where it trades 100 crore a day.
    // Others (Auto, 5 stocks) trade a steady 10 crore a day.
    const nowSessions = days.slice(0, SHARE_BLOCK_SESSIONS);
    const bigWeek = new Set(nowSessions.slice(0, 5));
    const it = ["I1", "I2", "I3", "I4", "I5"].map((symbol) => ({ symbol, sector: "IT", h: histOn(asc, (d) => (bigWeek.has(d) ? 1e9 : 1e7)) }));
    const auto = ["A1", "A2", "A3", "A4", "A5"].map((symbol) => ({ symbol, sector: "Auto", h: histOn(asc, () => 1e8) }));
    const rows = sectorShareYear([...it, ...auto], b);
    const r = rows.find((x) => x.sector === "IT")!;
    const itNow = 5 * (5 * 1e9 + 58 * 1e7), autoNow = 5 * 63 * 1e8;
    expect(r.nowTurnover).toBeCloseTo(itNow, 0);
    expect(r.nowTotal).toBeCloseTo(itNow + autoNow, 0);
    const s = shareChange(rows).rows.find((x) => x.sector === "IT")!;
    expect(s.nowPct).toBeCloseTo((100 * itNow) / (itNow + autoNow), 9);
    // the mean of weekly shares would be far lower: one week at ~91%, the rest at ~9%
    expect(s.nowPct).toBeGreaterThan(40);
  });

  test("change is in percentage points: 23.4% → 26.1% is +2.7, not +11.5%", () => {
    const row = (sector: string, now: number, ago: number): ShareYearRow =>
      ({ sector, stocks: 5, nowTurnover: now, nowTotal: 1000, agoTurnover: ago, agoTotal: 1000, newListingTurnover: 0, demerged: [] });
    const out = shareChange([row("Financial Services", 261, 234), row("IT", 63, 81)]);
    const fs = out.rows.find((x) => x.sector === "Financial Services")!;
    expect(fs.nowPct).toBeCloseTo(26.1, 9);
    expect(fs.agoPct).toBeCloseTo(23.4, 9);
    expect(fs.changePts).toBeCloseTo(2.7, 9);
    expect(out.rows.map((x) => x.sector)).toEqual(["Financial Services", "IT"]); // largest gain first
  });

  test("sort: largest gain first, ties by sector name", () => {
    const row = (sector: string, now: number, ago: number): ShareYearRow =>
      ({ sector, stocks: 5, nowTurnover: now, nowTotal: 1000, agoTurnover: ago, agoTotal: 1000, newListingTurnover: 0, demerged: [] });
    const out = shareChange([row("Zinc", 100, 90), row("Auto", 100, 90), row("Gas", 50, 80), row("Bank", 200, 100)]);
    expect(out.rows.map((x) => x.sector)).toEqual(["Bank", "Auto", "Zinc", "Gas"]);
  });

  test("rows plus the small-sectors footnote add to 100%, now and a year ago", () => {
    const mk = (prefix: string, sector: string, n: number, rupees: number) =>
      Array.from({ length: n }, (_, i) => ({ symbol: `${prefix}${i}`, sector, h: histOn(asc, () => rupees + i * 1e5) }));
    const stocks = [...mk("F", "Financial Services", 6, 3e7), ...mk("I", "IT", 5, 2e7), ...mk("T", "Textiles", 3, 5e7), ...mk("M", "Media", 1, 9e7)];
    const rows = sectorShareYear(stocks, b);
    expect(rows.map((r) => r.sector).sort()).toEqual(["Financial Services", "IT"]);
    const out = shareChange(rows);
    expect(out.small.nowPct).toBeGreaterThan(0);
    expect(Math.abs(out.rows.reduce((s, r) => s + r.nowPct, 0) + out.small.nowPct - 100)).toBeLessThan(NOISE_PCT);
    expect(Math.abs(out.rows.reduce((s, r) => s + r.agoPct!, 0) + out.small.agoPct! - 100)).toBeLessThan(NOISE_PCT);
  });

  test("rows come from today's list: a sector with 3 trading stocks a year ago keeps its year-ago ₹", () => {
    // Pharma has 5 stocks today; two listed after the year-ago block.
    const old = ["P1", "P2", "P3"].map((symbol) => ({ symbol, sector: "Pharma", h: histOn(asc, () => 1e7) }));
    const fresh = ["P4", "P5"].map((symbol) => ({ symbol, sector: "Pharma", h: histOn(asc, (d) => (d >= "2026-01-01" ? 1e7 : 0)) }));
    const other = ["O1", "O2", "O3", "O4", "O5"].map((symbol) => ({ symbol, sector: "Oil", h: histOn(asc, () => 1e7) }));
    const rows = sectorShareYear([...old, ...fresh, ...other], b);
    const p = rows.find((r) => r.sector === "Pharma")!;
    const agoSessions = days.filter(inAgo).length;
    expect(p.agoTurnover).toBeCloseTo(3 * agoSessions * 1e7, 0);
    expect(p.stocks).toBe(5);
  });

  test("new listings: no traded session in the year-ago block counts; one traded session there doesn't", () => {
    const agoDay = days.find(inAgo)!;
    const stocks = [
      { symbol: "NEW", sector: "Pharma", h: histOn(asc, (d) => (inNow(d) ? 1e7 : 0)) },
      { symbol: "ONE", sector: "Pharma", h: histOn(asc, (d) => (inNow(d) || d === agoDay ? 1e7 : 0)) },
      ...["P3", "P4", "P5"].map((symbol) => ({ symbol, sector: "Pharma", h: histOn(asc, () => 1e7) })),
    ];
    expect([...newListings(stocks, b)]).toEqual(["NEW"]);
    const p = sectorShareYear(stocks, b)[0]!;
    expect(p.newListingTurnover).toBeCloseTo(SHARE_BLOCK_SESSIONS * 1e7, 0);
    const s = shareChange([p]).rows[0]!;
    expect(s.newListingPct).toBeCloseTo(20, 9);
    expect(s.partlyNew).toBe(true);
  });

  test(`the ${NEW_LISTING_MARK * 100}% new-listing mark: exactly at the mark (even in float) is marked, just under is not`, () => {
    const row = (newListingTurnover: number, nowTurnover: number): ShareYearRow =>
      ({ sector: "X", stocks: 5, nowTurnover, nowTotal: 100, agoTurnover: 1, agoTotal: 100, newListingTurnover, demerged: [] });
    expect(0.3 / 3).toBeLessThan(0.1); // 0.09999999999999999: a plain >= would miss it
    expect(shareChange([row(0.3, 3)]).rows[0]!.partlyNew).toBe(true);
    expect(shareChange([row(1, 10)]).rows[0]!.partlyNew).toBe(true);
    expect(shareChange([row(0.99, 10)]).rows[0]!.partlyNew).toBe(false);
    expect(shareChange([row(0, 0)]).rows[0]!).toMatchObject({ newListingPct: null, partlyNew: false });
  });
});

describe("weekly share in sector_flow_weeks", () => {
  test("week 0 share equals the bars' 1-week share; total includes small sectors", () => {
    const stocks = [
      ...["A", "B", "C", "D", "E"].map((symbol, j) => ({ symbol, sector: "IT", h: hist(400, { turnover: Array.from({ length: 400 }, (_, i) => 1e7 + j * 1e6 + i * 1e4) }) })),
      ...["F", "G"].map((symbol) => ({ symbol, sector: "Textiles", h: hist(400, { turnover: Array(400).fill(4e7) }) })),
    ];
    const days = newestFirst(stocks[0]!.h);
    const weeks = weeklySectorFlows(stocks, weekWindows(days), new Set(), null);
    const bars = sectorFlows(stocks.map((s) => ({ symbol: s.symbol, sector: s.sector, ...flowStats(s.h, flowWindows(days)!).find((x) => x.period === 5)! })), 5);
    const w0 = weeks.find((x) => x.weekEnd === days[0] && x.sector === "IT")!;
    expect(w0.turnover / w0.totalTurnover).toBeCloseTo(bars.sectors[0]!.share, 12);
    expect(weeks.some((x) => x.sector === "Textiles")).toBe(false); // small today: no rows
    expect(w0.newListingTurnover).toBeNull(); // no year-ago block given
  });

  test("a week where the sector had under 5 trading stocks keeps its ₹ (share), with no ratio", () => {
    // E lists late: in old weeks IT has only 4 trading stocks
    const late = 300;
    const stocks = ["A", "B", "C", "D", "E"].map((symbol) => ({
      symbol, sector: "IT",
      h: symbol === "E" ? (() => { const h = hist(400); return { ...h, ...Object.fromEntries(Object.entries(h).map(([k, v]) => [k, (v as unknown[]).slice(late)])) } as History; })() : hist(400),
    }));
    const days = newestFirst(stocks[0]!.h);
    const weeks = weeklySectorFlows(stocks, weekWindows(days), new Set(), null);
    expect(weeks).toHaveLength(HISTORY_WEEKS);
    const oldest = weeks.at(-1)!;
    expect(oldest.stocks).toBe(4);
    expect(oldest.ratio).toBeNull();
    expect(oldest.turnover).toBeCloseTo(4 * 5 * 1e7, 0);
    expect(weeks[0]!.ratio).not.toBeNull();
  });

  test("newListingTurnover: that week's ₹ from stocks marked new", () => {
    const stocks = ["A", "B", "C", "D", "E"].map((symbol) => ({ symbol, sector: "IT", h: hist(400) }));
    const days = newestFirst(stocks[0]!.h);
    const weeks = weeklySectorFlows(stocks, weekWindows(days), new Set(), new Set(["A", "B"]));
    expect(weeks[0]!.newListingTurnover).toBeCloseTo(2 * 5 * 1e7, 0);
  });
});

describe("demergers inside the comparison (part of a year-ago company now trades elsewhere)", () => {
  const days = weekdaysBetween("2025-01-01", "2026-10-06");
  const asc = [...days].reverse();
  const b = shareBlocks(days)!;
  // Auto: BIG trades 1e7 a day, four others share `rest` a day between them; BIG demerged on `ex`
  const sector = (ex: string[], bigShare: number) => {
    const rest = (1e7 * (1 - bigShare)) / bigShare / 4;
    return [
      { symbol: "BIG", sector: "Auto", h: { ...histOn(asc, () => 1e7), demergers: ex } },
      ...["A2", "A3", "A4", "A5"].map((symbol) => ({ symbol, sector: "Auto", h: histOn(asc, () => rest) })),
    ];
  };
  const flagged = (ex: string[], bigShare: number) => sectorShareYear(sector(ex, bigShare), b)[0]!.demerged;

  test(`a demerger inside (year-ago start, latest session] by a stock with ${DEMERGER_MARK * 100}%+ of the sector's year-ago ₹ is flagged`, () => {
    expect(flagged(["2025-10-14"], 0.5)).toEqual([{ symbol: "BIG", exDate: "2025-10-14" }]);
    expect(flagged([b.nowTo], 0.5)).toEqual([{ symbol: "BIG", exDate: b.nowTo }]);
  });
  test("exactly at the mark is flagged (even in float); just under isn't", () => {
    expect(flagged(["2025-10-14"], DEMERGER_MARK)).toHaveLength(1);
    expect(flagged(["2025-10-14"], DEMERGER_MARK * 0.99)).toEqual([]);
  });
  test("outside the window: on or before the year-ago start, or after the latest session, isn't flagged", () => {
    expect(flagged([b.agoFrom], 0.5)).toEqual([]); // both blocks are after the split
    expect(flagged(["2025-01-02"], 0.5)).toEqual([]);
    expect(flagged(["2026-10-07"], 0.5)).toEqual([]);
    expect(flagged([], 0.5)).toEqual([]);
  });
  test("shareChange carries the flag to the row", () => {
    expect(shareChange(sectorShareYear(sector(["2025-10-14"], 0.5), b)).rows[0]!.demerged).toEqual([{ symbol: "BIG", exDate: "2025-10-14" }]);
  });
});
