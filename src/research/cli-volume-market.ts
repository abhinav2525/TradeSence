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
