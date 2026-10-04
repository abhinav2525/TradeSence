# Research 0004 (volume, whole market) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `bun run research:volume-market` judges six volume signals across the liquid NSE market (2016–2022 decided, 2023+ confirmed), writes a Markdown report and a JSON of chart data, and a private Artifact page draws three charts from it.

**Architecture:** Pure per-stock maths in `src/research/volume-market.ts`, built from tested pieces (`adjustedBars`, `cmf`, `obv`, `quietFlags`, `crossFlags`, `sma`, `windowMean`, `liquidFlags`, the activity price-move rule). The two-pass runner reuses research 0003's occasion, luck and verdict machinery (`occasionsOf`, `part`, `deliveryVerdict`, `matchedBaseline`, `assertAligned`) on volume signals.

**Tech Stack:** Bun, TypeScript, Postgres via drizzle, `bun:test`; the chart page is a static HTML Artifact (Chart library from cdnjs) fed by the runner's JSON.

**Spec:** `docs/superpowers/specs/2026-10-04-volume-whole-market-design.md`

## Global Constraints

- Universe: `companies(await allFundSymbols())`; eligible = `liquidFlags` (median 20-session turnover ≥ ₹1 crore).
- Volume normal: `windowMean(volume × shareFactors, segs, 1)` (previous 20, ≥ 15). Huge = ≥ 5 (minus 1e-9); heavy = ≥ `HEAVY` (2).
- Price move: adjusted close vs previous session, null when the previous EQ session is > `MAX_MOVE_GAP_DAYS` (5) calendar days back or in another segment.
- SMA 200 on adjusted closes per segment (`sma` per segment); cross via `crossFlags` (yesterday ≤, today >, same segment).
- CMF(20) top fifth with cut points from discovery eligible stock-days; quiet buying via `quietFlags` (20-session lookback).
- Returns from the D+1 adjusted close. Verdict spans `STUDY_HORIZONS` [5,10,21,63,126], main 21. Chart spans `CHART_HORIZONS` [1,3,5,10,21,42,63,126].
- Verdict: research 0003's `deliveryVerdict` unchanged (discovery ≤ 2022-12-31, 2023+ hold-out, 97.5 / 0.5 pts / sign / hold-out 95).
- Never compare computed numbers exactly (thresholds use a 1e-9 tolerance). Per-company history only via `loadAdjustedHistory`.
- Tests from the repo root. Rules in the spec are fixed; nothing is tuned after seeing results.

## Review Focus

- A stock with fewer than 200 sessions in a segment: no SMA, so signals 3–4 can't fire; 1, 2, 5, 6 still can.
- A huge-volume day with no valid price move (gap rule): fires neither signal 1 nor 2.
- CMF undefined (zero volume over the window): never in the top fifth.
- The chart horizons: a 1-session return is D+1 → D+2, not D → D+1.
- The JSON must not contain NaN or Infinity (the page would break): nulls instead.

---

### Task 1: Per-stock volume series and the six signals

**Files:** Create `src/research/volume-market.ts`, `tests/volume-market.test.ts`; modify `src/indicators/activity.ts` (export `dayGap`).

**Interfaces:**
- Consumes: `History`; `adjustedBars`, `cmf`, `obv`, `quietFlags`, `crossFlags`, `HEAVY` (`./volume`); `sma` (`../indicators/moving-average`); `windowMean`, `liquidFlags`, `MAX_MOVE_GAP_DAYS`, `dayGap` (`../indicators/activity`); `segmentByGaps`; `segmentIds`, `forwardReturnSafe` (`../indicators/signals`).
- Produces: `CHART_HORIZONS = [1, 3, 5, 10, 21, 42, 63, 126] as const`; `HUGE_X = 5`; `MARKET_SIGNALS: readonly string[]` (6 names, spec order);
  `type VolumeSeries = { dates: string[]; close: number[]; volRatio: (number|null)[]; move: (number|null)[]; sma200: (number|null)[]; cmf: (number|null)[]; quietBuying: boolean[]; eligible: boolean[]; returns: (number|null)[][] }` (`returns[h][i]`, h indexes `CHART_HORIZONS`);
  `volumeSeries(h: History): VolumeSeries`;
  `volumeSignalFlags(s: VolumeSeries, cmfCuts: number[]): boolean[][]` (`VolumeSeries.close` holds the adjusted closes).

- [ ] **Step 1: Export `dayGap`** in `src/indicators/activity.ts`: change `const dayGap = (a: string, b: string) =>` to `export const dayGap = (a: string, b: string) =>`.

- [ ] **Step 2: Failing tests** — `tests/volume-market.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import type { History } from "../src/indicators/history";
import { volumeSeries, volumeSignalFlags, CHART_HORIZONS, MARKET_SIGNALS } from "../src/research/volume-market";

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
    turnover: fill(2e7), factors: fill(1), shareFactors: fill(1), traded: fill(null), delivered: fill(null),
    ...over,
  } as History;
}
const arr = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => f(i));
const NO_CMF_CUTS = [Infinity, Infinity, Infinity, Infinity]; // nothing reaches the top fifth

describe("volumeSeries", () => {
  test("volume ratio against the previous 20 sessions, split-adjusted", () => {
    const n = 40;
    const volume = arr(n, (i) => (i < 25 ? 1000 : i === 30 ? 10000 : 2000));
    const shareFactors = arr(n, (i) => (i < 25 ? 2 : 1)); // 1:2 split on day 25
    const s = volumeSeries(hist(n, { volume, shareFactors, factors: shareFactors, close: arr(n, (i) => (i < 25 ? 200 : 100)) }));
    expect(s.volRatio[30]).toBeCloseTo(5, 9);
    expect(s.volRatio[26]).toBeCloseTo(1, 9);
  });

  test("returns start at the next session: the 1-session return is D+1 → D+2", () => {
    const s = volumeSeries(hist(40, { close: arr(40, (i) => 100 + i) }));
    expect(CHART_HORIZONS[0]).toBe(1);
    expect(s.returns[0]![20]).toBeCloseTo((122 / 121 - 1) * 100, 9);
  });

  test("no SMA 200 without 200 sessions in the segment", () => {
    expect(volumeSeries(hist(150)).sma200.every((v) => v === null)).toBe(true);
    expect(volumeSeries(hist(210)).sma200[205]).toBeCloseTo(100, 9);
  });

  test("the price move follows the page's gap rule", () => {
    const h = hist(40, { close: arr(40, (i) => (i === 30 ? 50 : 100)) });
    const base = new Date(`${h.dates[29]}T00:00:00Z`).getTime();
    h.dates = h.dates.map((x, i) => (i >= 30 ? new Date(base + (15 + i - 30) * 86_400_000).toISOString().slice(0, 10) : x));
    expect(volumeSeries(h).move[30]).toBeNull();
  });
});

describe("volumeSignalFlags", () => {
  test("six signals, in the spec's order", () => {
    expect(MARKET_SIGNALS).toHaveLength(6);
    expect(volumeSignalFlags(volumeSeries(hist(40)), NO_CMF_CUTS)).toHaveLength(6);
  });

  test("huge volume splits by the day's move; exactly 5× counts, 4.9× doesn't", () => {
    const up = volumeSeries(hist(40, { volume: arr(40, (i) => (i === 30 ? 5000 : 1000)), close: arr(40, (i) => (i >= 30 ? 103 : 100)) }));
    let f = volumeSignalFlags(up, NO_CMF_CUTS);
    expect([f[0]![30], f[1]![30]]).toEqual([true, false]);
    const down = volumeSeries(hist(40, { volume: arr(40, (i) => (i === 30 ? 5000 : 1000)), close: arr(40, (i) => (i >= 30 ? 97 : 100)) }));
    f = volumeSignalFlags(down, NO_CMF_CUTS);
    expect([f[0]![30], f[1]![30]]).toEqual([false, true]);
    const short = volumeSeries(hist(40, { volume: arr(40, (i) => (i === 30 ? 4900 : 1000)), close: arr(40, (i) => (i >= 30 ? 103 : 100)) }));
    expect(volumeSignalFlags(short, NO_CMF_CUTS)[0]![30]).toBe(false);
  });

  test("a huge-volume day with no valid move fires neither", () => {
    const h = hist(40, { volume: arr(40, (i) => (i === 30 ? 9000 : 1000)), close: arr(40, (i) => (i >= 30 ? 50 : 100)) });
    const base = new Date(`${h.dates[29]}T00:00:00Z`).getTime();
    h.dates = h.dates.map((x, i) => (i >= 30 ? new Date(base + (15 + i - 30) * 86_400_000).toISOString().slice(0, 10) : x));
    const f = volumeSignalFlags(volumeSeries(h), NO_CMF_CUTS);
    expect([f[0]![30], f[1]![30]]).toEqual([false, false]);
  });

  test("breakout above the 200-day average on 2× volume", () => {
    const n = 230;
    const close = arr(n, (i) => (i < 220 ? 100 : 110));
    const volume = arr(n, (i) => (i === 220 ? 2000 : 1000));
    const f = volumeSignalFlags(volumeSeries(hist(n, { close, volume, high: close.map((c) => c + 1), low: close.map((c) => c - 1) })), NO_CMF_CUTS);
    expect(f[2]![220]).toBe(true);
    expect(f[2]!.filter(Boolean)).toHaveLength(1);
  });

  test("illiquid days never fire", () => {
    const h = hist(40, { volume: arr(40, (i) => (i === 30 ? 9000 : 1000)), close: arr(40, (i) => (i >= 30 ? 103 : 100)), turnover: arr(40, () => 5e6) });
    expect(volumeSignalFlags(volumeSeries(h), NO_CMF_CUTS).flatMap((f) => f).some(Boolean)).toBe(false);
  });

  test("buyers in control: CMF at or above the top-fifth cut", () => {
    const s = volumeSeries(hist(40, { close: arr(40, () => 101) })); // closes at the high: CMF = +1
    const f = volumeSignalFlags(s, [-0.5, 0, 0.5, 0.9]);
    expect(f[4]![30]).toBe(true);
  });
});
```

- [ ] **Step 3: Run** `bun test tests/volume-market.test.ts` — Expected: FAIL (cannot find module).

- [ ] **Step 4: Implement** `src/research/volume-market.ts`:

```ts
/**
 * Research 0004: does volume tell us anything across the whole market? Pure,
 * tested helpers; the runner is cli-volume-market.ts.
 * Spec: docs/superpowers/specs/2026-10-04-volume-whole-market-design.md.
 */
import { segmentByGaps } from "../indicators/gaps";
import type { History } from "../indicators/history";
import { sma } from "../indicators/moving-average";
import { forwardReturnSafe, segmentIds } from "../indicators/signals";
import { MAX_MOVE_GAP_DAYS, dayGap, liquidFlags, windowMean } from "../indicators/activity";
import { adjustedBars, cmf, crossFlags, fifthOf, obv, quietFlags } from "./volume";

export const CHART_HORIZONS = [1, 3, 5, 10, 21, 42, 63, 126] as const; // sessions after D+1
export const HUGE_X = 5;
const EPS = 1e-9; // thresholds on computed ratios (CLAUDE.md: never compare exactly)

export const MARKET_SIGNALS = [
  "Huge volume (≥ 5×), price up",
  "Huge volume (≥ 5×), price down",
  "Breakout above the 200-day average on heavy volume (≥ 2×)",
  "Breakdown below the 200-day average on heavy volume (≥ 2×)",
  "Buyers in control (Chaikin Money Flow, top fifth)",
  "Quiet buying (price down, On-Balance Volume up, 20 sessions)",
] as const;

export type VolumeSeries = {
  dates: string[];
  close: number[]; // adjusted
  volRatio: (number | null)[];
  move: (number | null)[];
  sma200: (number | null)[];
  cmf: (number | null)[];
  quietBuying: boolean[];
  eligible: boolean[];
  returns: (number | null)[][]; // [h][i] for CHART_HORIZONS, from the D+1 close
};

export function volumeSeries(h: History): VolumeSeries {
  const segs = segmentByGaps(h.dates);
  const seg = segmentIds(h.dates);
  const bars = adjustedBars(h);
  const volMean = windowMean(bars.volume, segs, 1);
  const volRatio = bars.volume.map((v, i) => (volMean[i] == null || volMean[i] === 0 ? null : v / volMean[i]!));
  const move = bars.close.map((c, i) =>
    i > 0 && seg[i] === seg[i - 1] && dayGap(h.dates[i - 1]!, h.dates[i]!) <= MAX_MOVE_GAP_DAYS ? (c / bars.close[i - 1]! - 1) * 100 : null);
  const sma200: (number | null)[] = new Array(h.dates.length).fill(null);
  for (const s of segs) {
    const m = sma(s.map((i) => bars.close[i]!), 200);
    s.forEach((i, j) => { sma200[i] = m[j]!; });
  }
  const n = h.dates.length;
  const returns = CHART_HORIZONS.map((hz) =>
    h.dates.map((_, i) => (i + 1 < n && seg[i + 1] === seg[i] ? forwardReturnSafe(bars.close, seg, i + 1, hz) : null)));
  return {
    dates: h.dates, close: bars.close, volRatio, move, sma200,
    cmf: cmf(bars), quietBuying: quietFlags(bars, obv(bars)).buying,
    eligible: liquidFlags(h.turnover, segs), returns,
  };
}

/** The six signals' flags, in MARKET_SIGNALS order. Only eligible days can fire. */
export function volumeSignalFlags(s: VolumeSeries, cmfCuts: number[]): boolean[][] {
  const n = s.dates.length;
  const cross = crossFlags(s.dates, s.close, s.sma200, s.volRatio);
  const out = MARKET_SIGNALS.map(() => new Array<boolean>(n).fill(false));
  for (let i = 0; i < n; i++) {
    if (!s.eligible[i]) continue;
    const vr = s.volRatio[i];
    const mv = s.move[i];
    const huge = vr != null && vr >= HUGE_X - EPS;
    out[0]![i] = huge && mv != null && mv > 0;
    out[1]![i] = huge && mv != null && mv < 0;
    out[2]![i] = cross.aboveHeavy[i]!; // crossFlags applies HEAVY (2×) itself
    out[3]![i] = cross.belowHeavy[i]!;
    const c = s.cmf[i];
    out[4]![i] = c != null && fifthOf(c, cmfCuts) === 4;
    out[5]![i] = s.quietBuying[i]!;
  }
  return out;
}
```

- [ ] **Step 5: Run** `bun test tests/volume-market.test.ts && bunx tsc --noEmit` — Expected: PASS.

- [ ] **Step 6: Commit** `git add src/research/volume-market.ts tests/volume-market.test.ts src/indicators/activity.ts && git commit -m "Research 0004: per-stock volume series and the six signals"`

---

### Task 2: The runner, the report and the chart data

**Files:** Create `src/research/cli-volume-market.ts`; modify `package.json`.

**Interfaces:** Consumes Task 1; `companies`, `allFundSymbols` (`../indicators/universe`); `tradingDays` (`./delivery-data`); `loadAdjustedHistory`, `loadRenames`; `median`; `STUDY_HORIZONS`, `fifthCuts` (`./volume`); `DISCOVERY_END`, `occasionsOf`, `part`, `deliveryVerdict`, `matchedBaseline`, `assertAligned`, `type Occasion` (`./delivery`). Produces `bun run research:volume-market` (Markdown on stdout) and `--json <path>` (chart data).

- [ ] **Step 1: Write** `src/research/cli-volume-market.ts`:

```ts
/**
 * Runs research 0004 and prints it as Markdown; `--json <file>` also writes the
 * three charts' data. Two passes (no history kept in memory), like research 0003.
 *   bun run research:volume-market > out.md
 *   bun run research:volume-market -- --json chart-data.json
 */
import { writeFileSync } from "node:fs";
import { sql } from "../db";
import { loadAdjustedHistory, loadRenames } from "../indicators/history";
import { median } from "../indicators/signals";
import { allFundSymbols, companies } from "../indicators/universe";
import { STUDY_HORIZONS, fifthCuts } from "./volume";
import { tradingDays } from "./delivery-data";
import { DISCOVERY_END, assertAligned, deliveryVerdict, matchedBaseline, occasionsOf, part, type Occasion } from "./delivery";
import { CHART_HORIZONS, MARKET_SIGNALS, volumeSeries, volumeSignalFlags, type VolumeSeries } from "./volume-market";

const START = "2016-09-28";
const VERDICT_H = STUDY_HORIZONS.map((h) => CHART_HORIZONS.indexOf(h as (typeof CHART_HORIZONS)[number]));
const MAIN_C = CHART_HORIZONS.indexOf(21); // index in chart horizons
const MAIN_V = STUDY_HORIZONS.indexOf(21); // index in verdict horizons
const jsonAt = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : null;
const f = (v: number | null, d = 1) =>
  v === null ? "—" : Math.abs(v) < 0.5 * 10 ** -d ? (0).toFixed(d) : `${v > 0 ? "+" : ""}${v.toFixed(d)}`;
const out: string[] = [];
const p = (line = "") => out.push(line);
const t0 = Date.now();

const funds = await allFundSymbols();
const [renames, symbols, days] = await Promise.all([loadRenames(), companies(funds), tradingDays(START)]);
const dayIdx = new Map(days.map((d, i) => [d, i]));
const H = CHART_HORIZONS.length;

async function each(fn: (s: VolumeSeries) => void) {
  for (const symbol of symbols) {
    const h = await loadAdjustedHistory(symbol, renames);
    if (h) fn(volumeSeries(h));
  }
}

// pass 1: per-day pools at every chart horizon; CMF cut points from discovery
const pools: number[][][] = Array.from({ length: H }, () => days.map(() => []));
const discoveryCmf: number[] = [];
let eligibleDays = 0;
await each((s) => {
  s.dates.forEach((d, i) => {
    const day = dayIdx.get(d);
    if (day === undefined || !s.eligible[i]) return;
    eligibleDays++;
    for (let h = 0; h < H; h++) { const r = s.returns[h]![i]; if (r != null) pools[h]![day]!.push(r); }
    if (d <= DISCOVERY_END && s.cmf[i] != null) discoveryCmf.push(s.cmf[i]!);
  });
});
const cmfCuts = fifthCuts(discoveryCmf);

// pass 2: signals; positions replay pass 1's order for the main-span pool
const posCount = days.map(() => 0);
const occ: Occasion[][] = MARKET_SIGNALS.map(() => []);
let stocksUsed = 0;
await each((s) => {
  stocksUsed++;
  const pos = s.dates.map((d, i) => {
    const day = dayIdx.get(d);
    if (day === undefined || !s.eligible[i] || s.returns[MAIN_C]![i] == null) return -1;
    return posCount[day]!++;
  });
  volumeSignalFlags(s, cmfCuts).forEach((flags, k) => {
    for (const o of occasionsOf(flags, s, (d) => dayIdx.get(d) ?? -1, (i) => pos[i]!)) if (o.day >= 0) occ[k]!.push(o);
  });
});
assertAligned(posCount, pools[MAIN_C]!);

// verdicts on the five study spans; chart lines on all eight
const verdictPools = VERDICT_H.map((c) => pools[c]!);
const onSpans = (o: Occasion): Occasion => ({ ...o, returns: VERDICT_H.map((c) => o.returns[c] ?? null) });
const results = MARKET_SIGNALS.map((name, k) => {
  const disc = occ[k]!.filter((o) => o.date <= DISCOVERY_END).map(onSpans);
  const hold = occ[k]!.filter((o) => o.date > DISCOVERY_END).map(onSpans);
  return deliveryVerdict(name, part(disc, verdictPools, MAIN_V), part(hold, verdictPools, MAIN_V), MAIN_V);
});
const clean = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : v);
const chart = MARKET_SIGNALS.map((name, k) => {
  const disc = occ[k]!.filter((o) => o.date <= DISCOVERY_END);
  return {
    name,
    verdict: results[k]!.verdict,
    effect: clean(results[k]!.effect),
    holdoutEffect: clean(results[k]!.holdout.medians[MAIN_V]! - (results[k]!.holdout.baseline[MAIN_V] ?? NaN)),
    episodes: results[k]!.discovery.n,
    holdoutEpisodes: results[k]!.holdout.n,
    path: CHART_HORIZONS.map((hz, c) => ({
      sessions: hz,
      signal: clean(median(disc.map((o) => o.returns[c]).filter((v): v is number => v != null))),
      baseline: clean(matchedBaseline(disc, pools[c]!, c)),
    })),
  };
});

// print
const luck = (l: { beat: number; direction: string } | null) => (l ? `${l.beat.toFixed(1)}% (${l.direction})` : "—");
p(`Generated ${new Date().toISOString().slice(0, 10)} · ${stocksUsed} companies (${funds.size} fund symbols left out) · ${eligibleDays.toLocaleString("en-IN")} eligible stock-days · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
p();
p("## Results (main span: 1 month; discovery 2016–2022, hold-out 2023–)");
p();
p("| Signal | Episodes | Months | Median | Typical same-day stock | Beats random | Same way | Effect | 2023– episodes | 2023– beats | Verdict |");
p("|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of results) {
  const d = r.discovery, h = r.holdout;
  p(`| ${r.name} | ${d.n} | ${d.months} | ${f(d.medians[MAIN_V]!)}% | ${f(d.baseline[MAIN_V]!)}% | ${luck(d.luck)} | ${r.same} of 4 | ${f(r.effect, 2)} pts | ${h.n} | ${luck(h.luck)} | ${r.verdict} |`);
}
p();
p("## Day by day after the signal (discovery medians vs the typical same-day stock)");
p();
p(`| Signal | ${CHART_HORIZONS.map((h) => `${h}d`).join(" | ")} |`);
p(`|---|${CHART_HORIZONS.map(() => "---").join("|")}|`);
for (const c of chart) p(`| ${c.name} | ${c.path.map((x) => `${f(x.signal)} vs ${f(x.baseline)}`).join(" | ")} |`);
p();
p(`CMF top-fifth cut (discovery): ${cmfCuts[3]!.toFixed(3)}.`);

if (jsonAt) writeFileSync(jsonAt, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), stocks: stocksUsed, eligibleDays, signals: chart }, null, 2));
console.log(out.join("\n"));
await sql.end();
```

`package.json` scripts, after `"research:delivery"`: `"research:volume-market": "bun run src/research/cli-volume-market.ts",`

- [ ] **Step 2: Typecheck** `bunx tsc --noEmit` — Expected: clean.

- [ ] **Step 3: Run** `time bun run research:volume-market -- --json <scratchpad>/r4.json > <scratchpad>/r4.md` (scratchpad = the session scratchpad directory). Expected: a few minutes; 6 result rows; JSON parses and contains no `NaN` (`grep -c NaN` → 0).

- [ ] **Step 4: Spot check** one signal-1 occasion against `unusual_days` (`volume = true` and `change_pct > 0` for that symbol and date) via the postgres MCP.

- [ ] **Step 5: Commit** `git add src/research/cli-volume-market.ts package.json && git commit -m "Research 0004: runner (bun run research:volume-market), Markdown and chart JSON"`

---

### Task 3: The chart page, write-up and docs

**Files:** Create `docs/research/0004-does-volume-predict-whole-market.md`; an Artifact HTML file in the scratchpad (published, private); modify `docs/decisions/README.md`, `TODO.md`, `README.md`, `CLAUDE.md`, `src/research/CLAUDE.md` only if wanted (generated file; leave).

- [ ] **Step 1: Chart page.** Load the `dataviz` and `artifact-design` skills (and run the Artifact `quickstart` first, as its tool requires). Build one HTML page from the run's JSON (embedded inline) with three charts, each answering one question in its title:
  1. "Which signals mattered?" — horizontal bars, 1-month effect vs the typical same-day stock, ±0.5-point cost lines, colour only on Build bars (up/down), grey otherwise; sorted by effect; hover shows episodes and verdict.
  2. "What happened after?" — for a selected signal (small selector), two lines over 1…126 sessions: signal median vs typical same-day stock; x axis labelled "sessions after the signal (from the next day's close)".
  3. "Does it still hold?" — paired bars per signal: 2016–2022 effect vs 2023-onward effect.
  Plain-language subtitle under each; a short "how to read this" note; example-free (real numbers only). Publish privately; give the owner the link.

- [ ] **Step 2: Write-up** `docs/research/0004-does-volume-predict-whole-market.md` in research 0003's structure (question, short answer table in plain words, how to read, results, what stands out, caveats incl. 6 tests and the same-day comparison, method, what it means for the Unusual activity page and the leaderboard, appendix = generated output). Every number from the run; re-check every sentence against the tables before committing (research 0003 lesson).

- [ ] **Step 3: Docs.** `docs/decisions/README.md` "Research 0004" row; `TODO.md` (Where we left off; the Volume section: what the page/leaderboard get); `README.md` commands row + a function-reference section for `src/research/volume-market.ts`; `CLAUDE.md` command line.

- [ ] **Step 4: Full suite** `bun test && bunx tsc --noEmit` — Expected: PASS.

- [ ] **Step 5: Commit** `git add docs README.md CLAUDE.md TODO.md && git commit -m "Research 0004 write-up and chart page"`
