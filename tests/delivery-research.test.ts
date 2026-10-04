import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { companies, fundSymbols } from "../src/indicators/universe";
import type { History } from "../src/indicators/history";
import { windowMean, stockSeries, WINDOW, signalFlags, levelCutsByDate, occasionsOf, SIGNALS, matchedLuck, matchedBaseline, part, deliveryVerdict, assertAligned, type Occasion } from "../src/research/delivery";
import { mulberry32 } from "../src/research/volume";

/** n consecutive weekdays from 2021-01-04, all fields filled, liquid. */
function hist(n: number, over: Partial<Record<keyof History, unknown[]>> = {}): History {
  const dates: string[] = [];
  const d = new Date("2021-01-04T00:00:00Z");
  while (dates.length < n) {
    if (d.getUTCDay() % 6 !== 0) dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const fill = <T,>(v: T) => dates.map(() => v);
  return {
    dates, open: fill(100), high: fill(101), low: fill(99), close: fill(100), volume: fill(1000),
    turnover: fill(2e7), factors: fill(1), shareFactors: fill(1), traded: fill(1000), delivered: fill(500),
    ...over,
  } as History;
}

describe("windowMean", () => {
  const segs = [[0, 1, 2, 3, 4]];
  test("offset 1 averages the sessions before i, offset 0 includes i", () => {
    const v = Array.from({ length: 30 }, (_, i) => i);
    const s = [v.map((_, i) => i)];
    expect(windowMean(v, s, 1)[25]).toBe((5 + 24) / 2); // sessions 5..24
    expect(windowMean(v, s, 0)[25]).toBe((6 + 25) / 2); // sessions 6..25
  });
  test("null with fewer than 15 values present", () => {
    expect(windowMean([1, 2, 3, 4, 5], segs, 1)[4]).toBeNull();
  });
  test("missing values are skipped, not counted as zero", () => {
    const v: (number | null)[] = Array.from({ length: 21 }, () => 10);
    v[3] = null;
    expect(windowMean(v, [v.map((_, i) => i)], 1)[20]).toBe(10);
  });
  test("never reaches across a segment boundary", () => {
    const v = Array.from({ length: 40 }, () => 1);
    const s = [Array.from({ length: 20 }, (_, i) => i), Array.from({ length: 20 }, (_, i) => i + 20)];
    expect(windowMean(v, s, 1)[25]).toBeNull(); // only 5 sessions into the second segment
  });
});

describe("stockSeries", () => {
  test("delivery % is delivered ÷ traded × 100", () => {
    expect(stockSeries(hist(30)).dp[0]).toBe(50);
  });

  test("rel is today's delivery % minus the previous 20 sessions' average", () => {
    const delivered = Array.from({ length: 30 }, () => 500);
    delivered[25] = 800;
    const s = stockSeries(hist(30, { delivered }));
    expect(s.rel[25]).toBeCloseTo(30, 9);
  });

  test("the five excluded days carry no figure", () => {
    const h = hist(30);
    h.dates[22] = "2019-06-17"; // only the label matters for this rule
    expect(stockSeries(h).dp[22]).toBeNull();
  });

  test("nothing traded is no figure, not 0% or a division by zero", () => {
    const traded = Array.from({ length: 30 }, () => 1000);
    traded[10] = 0;
    expect(stockSeries(hist(30, { traded })).dp[10]).toBeNull();
  });

  test("a 1:2 split inside the window doesn't fake a delivery spike", () => {
    // raw delivered doubles on the ex-date; shareFactors 2 before it, 1 after
    const delivered = Array.from({ length: 30 }, (_, i) => (i < 15 ? 500 : 1000));
    const traded = Array.from({ length: 30 }, (_, i) => (i < 15 ? 1000 : 2000));
    const shareFactors = Array.from({ length: 30 }, (_, i) => (i < 15 ? 2 : 1));
    const factors = shareFactors;
    const close = Array.from({ length: 30 }, (_, i) => (i < 15 ? 200 : 100));
    const s = stockSeries(hist(30, { delivered, traded, shareFactors, factors, close }));
    expect(s.spike[25]).toBeCloseTo(1, 9);
    expect(s.move[15]).toBeCloseTo(0, 9); // adjusted close flat across the split
  });

  test("returns start from the next session's close, never the signal day's", () => {
    const close = Array.from({ length: 40 }, (_, i) => 100 + i);
    const s = stockSeries(hist(40, { close }));
    // 5-session return for D = 20: close[21] → close[26]
    expect(s.returns[0]![20]).toBeCloseTo((126 / 121 - 1) * 100, 9);
  });

  test("no return when D+1 starts a new segment", () => {
    const h = hist(30);
    h.dates = h.dates.map((d, i) => (i >= 21 ? `2022-0${Math.floor(i / 10)}-1${i % 10}` : d));
    expect(stockSeries(h).returns[0]![20]).toBeNull();
  });

  test("eligible needs liquidity: a stock trading under ₹1 crore a day never counts", () => {
    const s = stockSeries(hist(30, { turnover: Array.from({ length: 30 }, () => 5e6) }));
    expect(s.eligible.some(Boolean)).toBe(false);
  });

  test("eligible from the first day with a usual level and 20 sessions of turnover", () => {
    const s = stockSeries(hist(30));
    expect(s.eligible.indexOf(true)).toBe(WINDOW - 1);
  });

  test("a company with no delivery rows is never eligible", () => {
    const none = Array.from({ length: 30 }, () => null);
    const s = stockSeries(hist(30, { traded: none, delivered: none }));
    expect(s.eligible.some(Boolean)).toBe(false);
  });
});
describe("signalFlags", () => {
  // A hand-built series: 4 days, all eligible.
  const s = {
    dates: ["2021-01-04", "2021-01-05", "2021-01-06", "2021-01-07"],
    dp: [50, 50, 50, 50], rel: [30, -30, 30, 0], spike: [2.5, 1, 2, 3], level: [80, 20, 50, 50],
    move: [1, -1, -2, 0], eligible: [true, true, true, false], returns: [],
  };
  const relCuts = [-20, -5, 5, 20];
  const cuts = () => [30, 40, 60, 70];
  const f = signalFlags(s, relCuts, cuts);

  test("eight signals, in the spec's order", () => {
    expect(SIGNALS).toHaveLength(8);
    expect(f).toHaveLength(8);
  });
  test("high / low delivery against its own normal", () => {
    expect(f[0]).toEqual([true, false, true, false]);
    expect(f[1]).toEqual([false, true, false, false]);
  });
  test("accumulation needs a rise, distribution a fall", () => {
    expect(f[2]).toEqual([true, false, false, false]);
    expect(f[3]).toEqual([false, false, true, false]);
  });
  test("spike at exactly 2× counts; price direction splits it; ineligible days never fire", () => {
    expect(f[4]).toEqual([true, false, false, false]);
    expect(f[5]).toEqual([false, false, true, false]);
  });
  test("level fifths are cut across stocks on each day", () => {
    expect(f[6]).toEqual([true, false, false, false]);
    expect(f[7]).toEqual([false, true, false, false]);
  });
  test("a day with no level cuts fires neither level signal", () => {
    const g = signalFlags(s, relCuts, () => undefined);
    expect(g[6]!.some(Boolean) || g[7]!.some(Boolean)).toBe(false);
  });
});

describe("levelCutsByDate", () => {
  test("cuts each date's values into fifths; too few values gives no cuts", () => {
    const m = levelCutsByDate(new Map([["d1", [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]], ["d2", [1, 2]]]));
    expect(m.get("d1")).toHaveLength(4);
    expect(m.has("d2")).toBe(false);
  });
});

describe("occasionsOf", () => {
  test("one occasion per episode start, carrying its returns, day and pool position", () => {
    // Days 1 and 13 are 11 sessions apart (> MERGE_GAP 10): two episodes. Day 12 would merge.
    const flags = [true, true, false, false, false, false, false, false, false, false, false, false, false, true];
    const s = {
      dates: flags.map((_, i) => `2021-01-${String(i + 1).padStart(2, "0")}`),
      dp: [], rel: [], spike: [], level: [], move: [], eligible: [],
      returns: [flags.map((_, i) => i * 1.0)],
    };
    const occ = occasionsOf(flags, s, (d) => Number(d.slice(-2)), (i) => i + 100);
    expect(occ.map((o) => o.date)).toEqual(["2021-01-01", "2021-01-14"]);
    expect(occ[1]).toEqual({ date: "2021-01-14", day: 14, pos: 113, returns: [13] });
  });
});
const occ = (day: number, pos: number, ret: number): Occasion => ({ date: `2021-01-${String(day + 1).padStart(2, "0")}`, day, pos, returns: [ret] });

describe("matchedLuck", () => {
  test("a signal far above every other stock on its days is 'better' with strength 100", () => {
    const pools = [[0, 1, 2, 50], [0, 1, 2, 50]];
    const l = matchedLuck([occ(0, 3, 50), occ(1, 3, 50)], pools, 0, 200)!;
    expect(l.direction).toBe("better");
    expect(l.strength).toBe(100);
  });

  test("never draws the stock itself, and skips a day with no other stock", () => {
    // Day 0 holds only the signal stock; day 1 has one other stock at 0.
    const l = matchedLuck([occ(0, 0, 5), occ(1, 0, 5)], [[5], [5, 0]], 0, 50)!;
    expect(l.beat).toBe(100); // every draw is [0]: below 5
  });

  test("is reproducible for a seed", () => {
    const pools = [[1, 2, 3, 4, 5], [5, 4, 3, 2, 1]];
    const s = [occ(0, 2, 3), occ(1, 0, 5)];
    expect(matchedLuck(s, pools, 0, 300, 7)).toEqual(matchedLuck(s, pools, 0, 300, 7));
  });

  // Calibration: a "signal" that is just random stocks should pass the 97.5 bar ~5% of the time.
  test("random signals pass the two-sided 97.5 bar about 5% of the time", () => {
    const rand = mulberry32(42);
    const pools = Array.from({ length: 200 }, () => Array.from({ length: 30 }, () => rand() * 20 - 10));
    let passes = 0;
    const runs = 300;
    for (let r = 0; r < runs; r++) {
      const sig = Array.from({ length: 40 }, () => {
        const day = Math.floor(rand() * pools.length);
        const pos = Math.floor(rand() * 30);
        return occ(day, pos, pools[day]![pos]!);
      });
      if (matchedLuck(sig, pools, 0, 200, r + 1)!.strength >= 97.5) passes++;
    }
    expect(passes / runs).toBeGreaterThan(0.01);
    expect(passes / runs).toBeLessThan(0.1);
  });
});

describe("part and deliveryVerdict", () => {
  // Two horizons for brevity; main = 0.
  const mk = (n: number, med: number, base: number, beat: number, same = 1) => ({
    n, months: 12, medians: [med, med], baseline: [base, base],
    luck: { beat, direction: beat >= 50 ? "better" as const : "worse" as const, strength: Math.max(beat, 100 - beat) },
  });

  // The baseline must be the luck check's own yardstick: a random stock from the
  // same days. "Median of each day's median" is a different statistic: here it
  // would say 51, while a random stock from these two days is typically ~2.
  test("part: baseline is the typical random stock from the same days, not the median of day medians", () => {
    const pools = [[[-10, -9, 100, 101, 102], [0, 1, 2, 3, 4]]];
    const p = part([occ(0, 0, 50), occ(1, 0, 50)], pools, 0);
    expect(p.baseline[0]).toBeGreaterThanOrEqual(0);
    expect(p.baseline[0]).toBeLessThanOrEqual(4);
    expect(p.medians[0]).toBe(50);
    expect(p.n).toBe(2);
  });

  test("matchedBaseline is reproducible and ignores occasions without a return", () => {
    const pools = [[1, 2, 3], [4, 5, 6]];
    const o = [occ(0, 0, 1), { ...occ(1, 0, 1), returns: [null] }];
    expect(matchedBaseline(o, pools, 0)).toBe(matchedBaseline(o, pools, 0));
    expect(matchedBaseline(o, pools, 0)).toBeLessThanOrEqual(3);
    expect(matchedBaseline([{ ...occ(0, 0, 1), returns: [null] }], pools, 0)).toBeNull();
  });

  test("Build needs discovery and hold-out both", () => {
    const v = deliveryVerdict("x", mk(40, 2, 0, 99), mk(40, 1, 0, 96), 0);
    expect(v.verdict).toBe("Build");
  });

  test("a discovery pass that the hold-out doesn't confirm is only Maybe", () => {
    expect(deliveryVerdict("x", mk(40, 2, 0, 99), mk(40, 1, 0, 80), 0).verdict).toBe("Maybe");
    expect(deliveryVerdict("x", mk(40, 2, 0, 99), mk(20, 1, 0, 99), 0).verdict).toBe("Maybe");
  });

  test("an effect under 0.5 points can't Build, however unusual", () => {
    expect(deliveryVerdict("x", mk(40, 0.3, 0, 100), mk(40, 0.3, 0, 100), 0).verdict).toBe("Maybe");
  });

  test("a 'worse' signal is confirmed by a hold-out beat of 5 or less", () => {
    expect(deliveryVerdict("x", mk(40, -2, 0, 1), mk(40, -1, 0, 4), 0).verdict).toBe("Build");
    expect(deliveryVerdict("x", mk(40, -2, 0, 1), mk(40, -1, 0, 96), 0).verdict).toBe("Maybe");
  });
});
describe("companies", () => {
  beforeEach(async () => {
    for (const t of [schema.dailyPrices, schema.symbolChanges]) await db.delete(t);
  });
  const bar = (tradeDate: string, symbol: string) => ({
    tradeDate, symbol, series: "EQ", open: 1, high: 1, low: 1, close: 1, prevClose: 1, volume: 1, turnover: 1,
  });

  test("each company once, under its latest symbol; delisted companies stay in", async () => {
    await db.insert(schema.dailyPrices).values([
      bar("2020-01-01", "OLDCO"), bar("2020-02-03", "NEWCO"), bar("2019-01-01", "GONE"),
    ]);
    await db.insert(schema.symbolChanges).values({ oldSymbol: "OLDCO", newSymbol: "NEWCO", changedOn: "2020-02-01" });
    expect((await companies()).sort()).toEqual(["GONE", "NEWCO"]);
  });

  test("a ticker reused after its rename is a company of its own", async () => {
    await db.insert(schema.dailyPrices).values([bar("2020-01-01", "ABC"), bar("2020-03-02", "XYZ"), bar("2021-01-04", "ABC")]);
    await db.insert(schema.symbolChanges).values({ oldSymbol: "ABC", newSymbol: "XYZ", changedOn: "2020-02-01" });
    expect((await companies()).sort()).toEqual(["ABC", "XYZ"]);
  });
});

// ── fixes from the final review ──

describe("fundSymbols", () => {
  test("reads ETFs (ISIN INF…) from a legacy bhavcopy, leaving companies (INE…) out", () => {
    const csv = [
      "SYMBOL,SERIES,OPEN,HIGH,LOW,CLOSE,LAST,PREVCLOSE,TOTTRDQTY,TOTTRDVAL,TIMESTAMP,TOTALTRADES,ISIN,",
      "GOLDBEES,EQ,1,1,1,1,1,1,1,1,03-OCT-2016,1,INF204KB17I5,",
      "INFY,EQ,1,1,1,1,1,1,1,1,03-OCT-2016,1,INE009A01021,",
    ].join("\n");
    expect(fundSymbols(csv)).toEqual(["GOLDBEES"]);
  });

  test("reads the UDiFF format too", () => {
    const csv = [
      "TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs",
      "2024-01-02,2024-01-02,CM,NSE,STK,1,INF732E01037,NIFTYBEES,EQ",
      "2024-01-02,2024-01-02,CM,NSE,STK,2,INE002A01018,RELIANCE,EQ",
    ].join("\n");
    expect(fundSymbols(csv)).toEqual(["NIFTYBEES"]);
  });

  test("refuses a file without an ISIN column rather than finding no funds", () => {
    expect(() => fundSymbols("SYMBOL,SERIES\nGOLDBEES,EQ")).toThrow(/ISIN/);
  });
});

describe("companies, review fixes", () => {
  beforeEach(async () => {
    for (const t of [schema.dailyPrices, schema.symbolChanges]) await db.delete(t);
  });
  const bar = (tradeDate: string, symbol: string, series = "EQ") => ({
    tradeDate, symbol, series, open: 1, high: 1, low: 1, close: 1, prevClose: 1, volume: 1, turnover: 1,
  });

  // Renamed and moved to trade-for-trade (BE): the new symbol has no EQ rows, so
  // the old one is the only way the company's EQ history gets studied.
  test("keeps an old symbol whose new symbol never traded in EQ", async () => {
    await db.insert(schema.dailyPrices).values([bar("2020-01-01", "SICKCO"), bar("2020-03-02", "SICKNEW", "BE")]);
    await db.insert(schema.symbolChanges).values({ oldSymbol: "SICKCO", newSymbol: "SICKNEW", changedOn: "2020-02-01" });
    expect(await companies()).toEqual(["SICKCO"]);
  });

  test("leaves out the symbols it is told are funds", async () => {
    await db.insert(schema.dailyPrices).values([bar("2020-01-01", "GOLDBEES"), bar("2020-01-01", "INFY")]);
    expect(await companies(new Set(["GOLDBEES"]))).toEqual(["INFY"]);
  });
});

describe("deliveryVerdict, review fix", () => {
  test("an effect pointing the other way from the luck check can't Build", () => {
    const p = (med: number, beat: number) => ({
      n: 40, months: 12, medians: [med, med], baseline: [0, 0],
      luck: { beat, direction: beat >= 50 ? "better" as const : "worse" as const, strength: Math.max(beat, 100 - beat) },
    });
    // luck says "better" (99) but the median sits 1 point BELOW the baseline
    expect(deliveryVerdict("x", p(-1, 99), p(-1, 99), 0).verdict).not.toBe("Build");
  });
});

describe("assertAligned", () => {
  test("passes when pass 2 counted exactly what pass 1 pooled, throws otherwise", () => {
    expect(() => assertAligned([2, 1], [[1, 2], [3]])).not.toThrow();
    expect(() => assertAligned([2, 0], [[1, 2], [3]])).toThrow(/day 1/);
  });
});
describe("shared with the Unusual activity page", () => {
  test("the study and the page use one copy of the maths", async () => {
    const a = await import("../src/indicators/activity");
    const r = await import("../src/research/delivery");
    expect(r.windowMean).toBe(a.windowMean);
    expect(r.EXCLUDED_DAYS).toBe(a.EXCLUDED_DAYS);
  });
  test("liquidFlags: median of the last 20 sessions' turnover ≥ ₹1 crore, within a segment", async () => {
    const { liquidFlags } = await import("../src/indicators/activity");
    const t = Array.from({ length: 25 }, (_, i) => (i < 12 ? 2e7 : 5e6));
    const f = liquidFlags(t, [t.map((_, i) => i)]);
    expect(f[18]).toBe(false); // fewer than 20 sessions
    expect(f[19]).toBe(true); // 12 of 20 at ₹2 cr: median ₹2 cr
    expect(f[24]).toBe(false); // 7 of 20 at ₹2 cr: median ₹50 lakh
  });
});
