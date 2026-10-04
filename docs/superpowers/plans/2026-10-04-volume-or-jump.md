# Research 0005 (volume or the jump?) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `bun run research:volume-or-jump` answers, two ways, whether huge volume adds to the post-jump underperformance found in research 0004, with a report and a charts page.

**Architecture:** Pure helpers in `src/research/volume-or-jump.ts` (move bands, size thirds, matching groups, OLS, Newey–West, the verdict), on top of research 0004's `volumeSeries` and research 0003's `part` / `matchedLuck` / `matchedBaseline`. A two-pass runner builds per-day baselines and size cut points, then the matched groups and the daily Fama–MacBeth fits.

**Tech Stack:** Bun, TypeScript, Postgres (read-only), `bun:test`.

**Spec:** `docs/superpowers/specs/2026-10-04-volume-or-jump-design.md`

## Global Constraints

- Universe/eligibility/returns exactly as research 0004 (`volumeSeries`; returns from the D+1 close at `CHART_HORIZONS`).
- Q1: up day with move ≥ +3% (1e-9 tolerance); signal volume ≥ 5× (1e-9 tolerance), control < 1.5×. Bands: [3,5), [5,8), [8,12), ≥12.
- Q2: `crossFlags` above, heavy ≥ 2× (signal) vs light < 1.5× (control). **Ruling (before results):** Q2 bands [−∞,1), [1,3), [3,5), [5,8), ≥8 — breakouts are mostly small moves; Q1's ≥3% bands would drop most of them.
- **Ruling (before results):** signal days merge into episodes per stock within `MERGE_GAP` (10), dated by their first day, as research 0004; control days are not merged (they are the comparison pool).
- Groups: calendar month + band + size third (third = rank of the stock's median 20-session turnover among that day's eligible stocks). Secondary: + NSE sector (Total Market stocks).
- Excess return = return − that day's median eligible return, per horizon.
- Matched comparison through research 0003's `part` with groups as the "days": pools = control excess per group; signal occasions carry `pos = −1`.
- Fama–MacBeth (Q1): each session, up days (move > 0) of eligible stocks, OLS of 21-session excess return on [1, ln(vol ratio), move, previous-21-session return, ln(median turnover)]; ≥ 100 stocks; mean b of ln(vol ratio), Newey–West t with 20 lags.
- Verdicts exactly as the spec; Q2 labelled "one method".
- Tests from the repo root; nothing tuned after results.

## Review Focus

- Groups with controls but where the signal stock itself is also a control: impossible by definition (signal ≥ 5×, control < 1.5×) — confirm.
- A month/band/third group with no control: signal dropped and counted, never matched across groups.
- OLS on a singular day (e.g. all ln(turnover) equal): skipped, not NaN in the mean.
- Newey–West with fewer days than lags: guard.
- JSON free of NaN/Infinity.

---

### Task 1: Pure helpers

**Files:** Create `src/research/volume-or-jump.ts`, `tests/volume-or-jump.test.ts`.

**Interfaces — produces:**
- `Q1_BANDS = [3, 5, 8, 12]`, `Q2_BANDS = [1, 3, 5, 8]`; `bandOf(move: number | null, cuts: readonly number[], floor: number | null): number | null` — index of the band; `floor` = minimum move (3 for Q1, null for Q2); null below floor or for null move.
- `thirdCuts(values: number[]): [number, number]` (33rd/67th percentile); `thirdOf(v: number, cuts: [number, number]): 0 | 1 | 2`
- `groupKey(date: string, band: number, third: number, sector?: string): string` → `"2021-03|2|1"` (+ `"|Sector"`)
- `ols(X: number[][], y: number[]): number[] | null` (null when singular)
- `neweyWest(series: number[], lags: number): { mean: number; se: number; t: number } | null`
- `type Verdict5 = "Volume adds" | "The jump explains it" | "Not settled"`
- `verdict5(o: { disc: Part; hold: Part; main: number; fmT: number | null; fmB: number | null; needFm: boolean }): Verdict5`

- [ ] **Step 1: Failing tests** — `tests/volume-or-jump.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import { bandOf, thirdCuts, thirdOf, groupKey, ols, neweyWest, verdict5, Q1_BANDS, Q2_BANDS } from "../src/research/volume-or-jump";
import { mulberry32 } from "../src/research/volume";

describe("bands, thirds, groups", () => {
  test("Q1 bands start at +3%, exactly 3 counts", () => {
    expect(bandOf(2.99, Q1_BANDS, 3)).toBeNull();
    expect(bandOf(3, Q1_BANDS, 3)).toBe(0);
    expect(bandOf(5, Q1_BANDS, 3)).toBe(1);
    expect(bandOf(11.9, Q1_BANDS, 3)).toBe(2);
    expect(bandOf(40, Q1_BANDS, 3)).toBe(3);
    expect(bandOf(null, Q1_BANDS, 3)).toBeNull();
  });
  test("Q2 bands cover small moves too", () => {
    expect(bandOf(0.4, Q2_BANDS, null)).toBe(0);
    expect(bandOf(2, Q2_BANDS, null)).toBe(1);
    expect(bandOf(9, Q2_BANDS, null)).toBe(4);
  });
  test("size thirds by rank that day", () => {
    const cuts = thirdCuts([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect([thirdOf(1, cuts), thirdOf(5, cuts), thirdOf(9, cuts)]).toEqual([0, 1, 2]);
  });
  test("group key: month, band, third (+ sector)", () => {
    expect(groupKey("2021-03-15", 2, 1)).toBe("2021-03|2|1");
    expect(groupKey("2021-03-15", 2, 1, "Capital Goods")).toBe("2021-03|2|1|Capital Goods");
  });
});

describe("ols", () => {
  test("recovers known coefficients", () => {
    const rand = mulberry32(3);
    const X: number[][] = [], y: number[] = [];
    for (let i = 0; i < 500; i++) {
      const a = rand(), b = rand();
      X.push([1, a, b]); y.push(2 - 3 * a + 0.5 * b + (rand() - 0.5) * 1e-6);
    }
    const c = ols(X, y)!;
    expect(c[0]).toBeCloseTo(2, 4); expect(c[1]).toBeCloseTo(-3, 4); expect(c[2]).toBeCloseTo(0.5, 4);
  });
  test("a singular design returns null, never NaN", () => {
    expect(ols([[1, 2], [1, 2], [1, 2]], [1, 2, 3])).toBeNull();
  });
});

describe("neweyWest", () => {
  test("lag 0 equals the ordinary t of a mean", () => {
    const s = [1, 2, 3, 4, 5];
    const r = neweyWest(s, 0)!;
    const sd = Math.sqrt(s.reduce((a, v) => a + (v - 3) ** 2, 0) / s.length);
    expect(r.mean).toBe(3);
    expect(r.se).toBeCloseTo(sd / Math.sqrt(5), 9);
  });
  test("positive autocorrelation widens the error", () => {
    const s = Array.from({ length: 200 }, (_, i) => (Math.floor(i / 20) % 2 ? 1 : -1) + 0.1);
    expect(neweyWest(s, 20)!.se).toBeGreaterThan(neweyWest(s, 0)!.se);
  });
  test("too short a series: null", () => {
    expect(neweyWest([1, 2], 20)).toBeNull();
  });
});

describe("verdict5", () => {
  const part = (n: number, med: number, base: number, beat: number) => ({
    n, months: 12, medians: [med, med, med, med, med], baseline: [base, base, base, base, base],
    luck: { beat, direction: beat >= 50 ? "better" as const : "worse" as const, strength: Math.max(beat, 100 - beat) },
  });
  test("Volume adds: both methods, both periods", () => {
    expect(verdict5({ disc: part(50, -1, 0, 1), hold: part(40, -0.8, 0, 3), main: 2, fmT: -3.5, fmB: -0.2, needFm: true })).toBe("Volume adds");
  });
  test("a weak regression keeps it Not settled", () => {
    expect(verdict5({ disc: part(50, -1, 0, 1), hold: part(40, -0.8, 0, 3), main: 2, fmT: -2.1, fmB: -0.2, needFm: true })).toBe("Not settled");
  });
  test("The jump explains it: under 0.3 pts in both periods", () => {
    expect(verdict5({ disc: part(50, -0.1, 0, 30), hold: part(40, 0.2, 0, 60), main: 2, fmT: -1, fmB: -0.01, needFm: true })).toBe("The jump explains it");
  });
  test("one-method question ignores the regression", () => {
    expect(verdict5({ disc: part(50, -1, 0, 1), hold: part(40, -0.8, 0, 3), main: 2, fmT: null, fmB: null, needFm: false })).toBe("Volume adds");
  });
});
```

- [ ] **Step 2: Run** — FAIL (module missing).

- [ ] **Step 3: Implement** `src/research/volume-or-jump.ts`:

```ts
/**
 * Research 0005: volume or the jump? Pure helpers; runner cli-volume-or-jump.ts.
 * Spec: docs/superpowers/specs/2026-10-04-volume-or-jump-design.md.
 */
import { quantile, sameWay } from "./volume";
import { HOLDOUT_BAR, MIN_EFFECT, MIN_EPISODES, type Part } from "./delivery";

const EPS = 1e-9;
export const Q1_BANDS = [3, 5, 8, 12] as const; // day's move, %: [3,5) [5,8) [8,12) [12,∞)
export const Q2_BANDS = [1, 3, 5, 8] as const; // breakouts: (−∞,1) [1,3) [3,5) [5,8) [8,∞)
export const JUMP_FLOOR = 3;
export const SETTLED_BELOW = 0.3; // pts: "the jump explains it" in both periods
export const FM_T = 3; // Harvey, Liu & Zhu (2016)

export function bandOf(move: number | null, cuts: readonly number[], floor: number | null): number | null {
  if (move === null) return null;
  if (floor !== null && move < floor - EPS) return null;
  let k = 0;
  while (k < cuts.length && move >= cuts[k]! - EPS) k++;
  return floor !== null ? k - 1 : k;
}

export function thirdCuts(values: number[]): [number, number] {
  const s = [...values].sort((a, b) => a - b);
  return [quantile(s, 1 / 3), quantile(s, 2 / 3)];
}
export function thirdOf(v: number, cuts: [number, number]): 0 | 1 | 2 {
  return v < cuts[0] ? 0 : v < cuts[1] ? 1 : 2;
}

export function groupKey(date: string, band: number, third: number, sector?: string): string {
  return `${date.slice(0, 7)}|${band}|${third}${sector ? `|${sector}` : ""}`;
}

/** Least squares by the normal equations (Gaussian elimination, partial pivoting); null if singular. */
export function ols(X: number[][], y: number[]): number[] | null {
  const k = X[0]?.length ?? 0;
  const A = Array.from({ length: k }, () => new Array<number>(k + 1).fill(0));
  for (let r = 0; r < X.length; r++) {
    const x = X[r]!;
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) A[i]![j]! += x[i]! * x[j]!;
      A[i]![k]! += x[i]! * y[r]!;
    }
  }
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[p]![c]!)) p = r;
    if (Math.abs(A[p]![c]!) < 1e-12) return null;
    [A[c], A[p]] = [A[p]!, A[c]!];
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = A[r]![c]! / A[c]![c]!;
      for (let j = c; j <= k; j++) A[r]![j]! -= f * A[c]![j]!;
    }
  }
  const out = A.map((row, i) => row[k]! / row[i]!);
  return out.every(Number.isFinite) ? out : null;
}

/** Mean of a time series with a Newey–West (Bartlett) standard error; null if too short. */
export function neweyWest(series: number[], lags: number): { mean: number; se: number; t: number } | null {
  const n = series.length;
  if (n < Math.max(3, lags + 2)) return null;
  const mean = series.reduce((a, v) => a + v, 0) / n;
  const e = series.map((v) => v - mean);
  let s = e.reduce((a, v) => a + v * v, 0) / n;
  for (let L = 1; L <= lags; L++) {
    let c = 0;
    for (let t = L; t < n; t++) c += e[t]! * e[t - L]!;
    s += 2 * (1 - L / (lags + 1)) * (c / n);
  }
  const se = Math.sqrt(Math.max(s, 0) / n);
  return { mean, se, t: se > 0 ? mean / se : 0 };
}

export type Verdict5 = "Volume adds" | "The jump explains it" | "Not settled";

export function verdict5(o: { disc: Part; hold: Part; main: number; fmT: number | null; fmB: number | null; needFm: boolean }): Verdict5 {
  const eff = (p: Part) => (p.medians[o.main] == null || p.baseline[o.main] == null ? null : p.medians[o.main]! - p.baseline[o.main]!);
  const dE = eff(o.disc), hE = eff(o.hold), dl = o.disc.luck, hl = o.hold.luck;
  const same = sameWay(o.disc.medians, o.disc.baseline, o.main);
  const dir = dE === null ? 0 : Math.sign(dE);
  const matched = o.disc.n >= MIN_EPISODES && dl !== null && dl.strength >= 97.5 && dE !== null && Math.abs(dE) >= MIN_EFFECT &&
    dir === (dl.direction === "better" ? 1 : -1) && same >= 3 &&
    o.hold.n >= MIN_EPISODES && hl !== null && (dir > 0 ? hl.beat >= HOLDOUT_BAR : hl.beat <= 100 - HOLDOUT_BAR);
  const fm = !o.needFm || (o.fmT !== null && o.fmB !== null && Math.abs(o.fmT) >= FM_T && Math.sign(o.fmB) === dir);
  if (matched && fm) return "Volume adds";
  if (dE !== null && hE !== null && Math.abs(dE) < SETTLED_BELOW && Math.abs(hE) < SETTLED_BELOW) return "The jump explains it";
  return "Not settled";
}
```

(`bandOf` with a floor: the cuts start at the floor, so the band is the count of cuts passed minus one.)

- [ ] **Step 4: Run** `bun test tests/volume-or-jump.test.ts && bunx tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** `git add src/research/volume-or-jump.ts tests/volume-or-jump.test.ts && git commit -m "Research 0005: bands, size thirds, OLS, Newey-West, verdict"`

---

### Task 2: The runner, report and chart data

**Files:** Create `src/research/cli-volume-or-jump.ts`; modify `package.json` (`"research:volume-or-jump": "bun run src/research/cli-volume-or-jump.ts"`).

- [ ] **Step 1: Write the runner** with this structure (two passes over `companies(await allFundSymbols())`, each company through `loadAdjustedHistory` + `volumeSeries`):
  1. **Pass 1:** for each eligible stock-day: push each `CHART_HORIZONS` return into `pools[h][day]`; push ln(median 20-session turnover) into `sizeByDay[day]`. Then `dayMedian[h][day] = median(pools[h][day])`, `cuts[day] = thirdCuts(sizeByDay[day])`.
  2. **Pass 2:** per stock: `excess[h][i] = returns[h][i] − dayMedian[h][day]`; `third = thirdOf(lnTurnover, cuts[day])`; Q1 signal/control and Q2 signal/control flags as the Global Constraints; signal flags → episode starts (`episodeStarts`); each signal start → an occasion `{ date, day: groupIndex(key), pos: -1, returns: excess at the 5 verdict spans }` into `q.disc` or `q.hold` (by date ≤ 2022-12-31); each control day → push its excess at each verdict span into `controlPools[q][h][groupIndex]`. Keep separate group-index maps per question (and per secondary sector variant). FM rows (Q1): for every eligible up day (move > 0) with a 21-session return, push `{ x: [1, ln(volRatio), move, prev21, lnTurnover], y: excess21 }` into `fmRows[day]`.
  3. Median 20-session turnover and prev21 come from the history: compute per stock with the same segment rules (`segmentByGaps`): median of the last 20 sessions' turnover (`liquidFlags`' window); prev21 = adjusted close D−1 ÷ D−22 − 1, same segment, else skip the FM row.
  4. **Results:** for each question, `part(disc, controlPools, MAIN_V)` and `part(hold, …)` (note: a signal whose group has no controls is dropped by `matchedLuck`; count dropped = occasions minus those whose group has controls, and report it). FM: for each day with ≥ 100 rows, `ols` → b[1]; discovery and hold-out series → `neweyWest(series, 20)`. `verdict5` for Q1 (needFm) and Q2 (one method).
  5. **Per band** (chart 2): Q1 discovery effect at 21 sessions per band (signal occasions filtered by band; baseline from their groups).
  6. **Secondary:** same Q1/Q2 comparison with sector-extended groups, Total Market stocks only (sector from `index_constituents` `total-market`); report effects only.
  7. **Print** Markdown (header line with counts and seconds; a results table per question: matched signal days, dropped, median excess, matched baseline, beats, same way, effect, 2023– effect and beats, verdict; the FM line: b, t (discovery), b, t (2023–), days used; the per-band table; the secondary table) and, with `--json <file>`, write `{ q1: {...}, q2: {...}, fm: {...}, bands: [...], secondary: {...} }` (nulls instead of NaN).
- [ ] **Step 2:** `bunx tsc --noEmit`; run `time bun run research:volume-or-jump -- --json <scratchpad>/r5.json > <scratchpad>/r5.md`; check no `NaN` in the JSON; read the output.
- [ ] **Step 3: Spot check:** one Q1 signal day equals a research 0004 signal-1 day (same volume ratio and move to 4 dp).
- [ ] **Step 4: Commit** `git add src/research/cli-volume-or-jump.ts package.json && git commit -m "Research 0005: runner, report and chart data"`

---

### Task 3: Charts page, write-up, docs

- [ ] **Step 1:** Charts page from the JSON (style of `docs/research/0004-charts.html`, tradeSence tokens, light/dark, phone width, data generated from the JSON — never typed): the one-line answer; chart 1 (Q1 and Q2: gap at each span with the ±0.5 cost band); chart 2 (Q1 gap per jump band); chart 3 (FM coefficient with ±2 s.e. range and the |t| ≥ 3 verdict, discovery and 2023–); chart 4 (2016–22 vs 2023– dumbbells); how to read (incl. "pts", "Maybe"/verdict words, one-method label for Q2); "See the numbers". One rendered look; publish privately; copy to `docs/research/0005-charts.html`.
- [ ] **Step 2:** `docs/research/0005-volume-or-jump.md` (research 0004's structure; every number from the run; re-check every sentence against the tables; literature context from the spec).
- [ ] **Step 3:** Docs: "Research 0005" row; TODO (caution line / Screener wording per the verdict); README function reference + command; CLAUDE.md command line.
- [ ] **Step 4:** `bun test && bunx tsc --noEmit`; commit; independent review; fix pass; merge.
