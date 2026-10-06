import { test, expect, describe } from "bun:test";
import {
  bucketMedians, buildSignals, episodesOf, forwardReturnSafe, isCondition, median,
  segmentIds, summarizeHorizons, washoutStatus, type Day,
} from "../src/indicators/signals";

const day = (i: number) => {
  const d = new Date(Date.UTC(2020, 0, 1));
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
};
const mk = (pcts: number[], closes?: (i: number) => number): Day[] =>
  pcts.map((pct, i) => ({ date: day(i), pct, close: closes ? closes(i) : 100 }));

describe("washoutStatus", () => {
  test("under 20 is Active; 20 to 25 inclusive is Watching; above 25 is Quiet", () => {
    expect(washoutStatus(19.99)).toBe("active");
    expect(washoutStatus(20)).toBe("watching");
    expect(washoutStatus(25)).toBe("watching");
    expect(washoutStatus(25.01)).toBe("quiet");
  });
});

describe("isCondition", () => {
  test("accepts exactly under and over", () => {
    expect(isCondition("under")).toBe(true);
    expect(isCondition("over")).toBe(true);
    for (const v of ["OVER", "over'--", "", " under", undefined]) expect(isCondition(v)).toBe(false);
  });
});

describe("forwardReturnSafe", () => {
  test("is the % change h sessions on", () => {
    expect(forwardReturnSafe([100, 110, 121], [0, 0, 0], 0, 2)).toBeCloseTo(21, 9);
  });
  test("is null past the last session", () => {
    expect(forwardReturnSafe([100, 110, 121], [0, 0, 0], 1, 2)).toBeNull();
  });
  test("is null across a hole in the data", () => {
    expect(forwardReturnSafe([100, 110, 121], [0, 0, 1], 0, 2)).toBeNull();
  });
});

test("segmentIds numbers each session's segment, splitting at a hole over 21 days", () => {
  expect(segmentIds(["2020-01-01", "2020-01-02", "2020-03-01"])).toEqual([0, 0, 1]);
});

test("median of odd, even and empty lists", () => {
  expect(median([3, 1, 2])).toBe(2);
  expect(median([4, 1, 3, 2])).toBe(2.5);
  expect(median([])).toBeNull();
});

describe("episodesOf", () => {
  const pcts = [50, 15, 12, 30, 18, ...Array(12).fill(50), 10];

  test("under 20%: dates, lowest reading and sessions under", () => {
    const eps = episodesOf(mk(pcts), "under");
    expect(eps.map((e) => [e.start, e.last, e.extreme, e.sessions])).toEqual([
      [day(1), day(4), 12, 3],
      [day(17), day(17), 10, 1],
    ]);
  });

  test("over 80%: the highest reading", () => {
    const eps = episodesOf(mk([50, 85, 92, 81, 50]), "over");
    expect(eps).toHaveLength(1);
    expect(eps[0]!.extreme).toBe(92);
  });

  test("a horizon past the latest session is null and pending; one inside is a number", () => {
    const days = mk([10, ...Array(29).fill(50)], (i) => (i === 0 ? 100 : 110));
    const [e] = episodesOf(days, "under");
    expect(e!.returns["1m"]).toBeCloseTo(10, 9);
    expect(e!.pending["1m"]).toBe(false);
    expect(e!.returns["3m"]).toBeNull();
    expect(e!.pending["3m"]).toBe(true);
  });

  test("a horizon across a data hole is null but not pending", () => {
    const days = mk([10, ...Array(29).fill(50)]);
    for (let i = 5; i < days.length; i++) days[i]!.date = day(i + 60); // a 60-day hole after day 4
    const [e] = episodesOf(days, "under");
    expect(e!.returns["1m"]).toBeNull();
    expect(e!.pending["1m"]).toBe(false);
  });
});

describe("summarizeHorizons", () => {
  test("a flat 0% is not counted as higher", () => {
    const days = mk([10, ...Array(129).fill(50)]);
    const [one] = summarizeHorizons(days, episodesOf(days, "under"));
    expect(one).toMatchObject({ key: "1m", n: 1, median: 0, higher: 0, best: 0, worst: 0, baseline: 0 });
  });

  test("episodes without the horizon behind them are left out; baseline is the median of every session", () => {
    const pcts = [10, ...Array(129).fill(50)];
    pcts[120] = 10; // a second, recent episode: no 1-month return yet
    const days = mk(pcts, (i) => (i === 0 ? 100 : 110));
    const hs = summarizeHorizons(days, episodesOf(days, "under"));
    for (const h of hs) {
      expect(h.n).toBe(1);
      expect(h.higher).toBe(1);
      expect(h.median).toBeCloseTo(10, 9);
      expect(h.baseline).toBe(0); // only the first session rose
    }
  });
});

test("bucketMedians: median return per breadth bucket and over all sessions", () => {
  const days = mk([10, 30, 50, 70, 90, 10], (i) => [100, 110, 121, 121, 100, 100][i]!);
  const { buckets, all } = bucketMedians(days, 1);
  expect(buckets.map((b) => b.bucket)).toEqual(["<20", "20–40", "40–60", "60–80", "≥80"]);
  expect(buckets[0]).toMatchObject({ n: 1 });
  expect(buckets[0]!.median).toBeCloseTo(10, 9); // the last session has no return yet
  expect(buckets[2]!.median).toBeCloseTo(0, 9);
  expect(buckets[3]!.median).toBeCloseTo((100 / 121 - 1) * 100, 9);
  expect(all).toBeCloseTo(0, 9);
});

describe("buildSignals", () => {
  test("an ongoing washout: Active, since its first day, counted in fired", () => {
    const pcts = [...Array(30).fill(50), 18, 16, 16];
    const s = buildSignals(mk(pcts));
    expect(s.washout).toEqual({ status: "active", pct: 16, date: day(32), since: day(30), lastStart: day(30), fired: 1 });
    expect(s.first).toBe(day(0));
    expect(s.recent).toHaveLength(33);
    expect(s.episodes.under).toHaveLength(1);
    expect(s.episodes.over).toHaveLength(0);
  });

  test("recent keeps the last 60 sessions", () => {
    expect(buildSignals(mk(Array(100).fill(50))).recent).toHaveLength(60);
  });

  test("no sessions: nothing to show", () => {
    const s = buildSignals([]);
    expect(s.washout).toBeNull();
    expect(s.first).toBeNull();
    expect(s.episodes.under).toEqual([]);
  });
});

describe("episode counts (decision 0035: 'x of N' for a small index)", () => {
  test("an episode carries the count on its lowest day when the days have counts", () => {
    const days: Day[] = [30, 16.7, 8.3, 25, 30].map((pct, i) => ({
      date: day(i), pct, close: 100, above: [4, 2, 1, 3, 4][i]!, total: 12,
    }));
    expect(episodesOf(days, "under")[0]).toMatchObject({ extreme: 8.3, extremeAbove: 1, extremeTotal: 12 });
  });
  test("without counts, nothing extra", () => {
    expect(episodesOf(mk([30, 10, 30]), "under")[0]!.extremeAbove).toBeUndefined();
  });
});
