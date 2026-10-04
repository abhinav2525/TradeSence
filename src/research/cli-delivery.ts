/**
 * Runs research 0003 and prints it as Markdown.
 *
 *   bun run research:delivery > /tmp/out.md
 *
 * Two passes over every company (no history kept in memory): pass 1 builds each
 * day's pool of eligible returns and the cut points; pass 2 finds the signals.
 * Rules are fixed in docs/superpowers/specs/2026-10-04-delivery-study-design.md.
 */
import { sql } from "../db";
import { loadAdjustedHistory, loadRenames } from "../indicators/history";
import { median } from "../indicators/signals";
import { memberWindows } from "./volume-data";
import { STUDY_HORIZONS, fifthCuts, fifthOf, memberFlags } from "./volume";
import { companies, tradingDays } from "./delivery-data";
import {
  DISCOVERY_END, SIGNALS, deliveryVerdict, levelCutsByDate, occasionsOf, part, signalFlags, stockSeries,
  type DeliveryResult, type Occasion, type StockSeries,
} from "./delivery";

const START = "2016-09-28";
const MAIN = STUDY_HORIZONS.indexOf(21);
const LABELS = ["1 week", "2 weeks", "1 month", "3 months", "6 months"];
const f = (v: number | null, d = 1) =>
  v === null ? "—" : Math.abs(v) < 0.5 * 10 ** -d ? (0).toFixed(d) : `${v > 0 ? "+" : ""}${v.toFixed(d)}`;
const out: string[] = [];
const p = (line = "") => out.push(line);
const t0 = Date.now();

const [renames, windows, symbols, days] = await Promise.all([loadRenames(), memberWindows(), companies(), tradingDays(START)]);
const dayIdx = new Map(days.map((d, i) => [d, i]));
const H = STUDY_HORIZONS.length;

async function each(fn: (symbol: string, s: StockSeries) => void) {
  for (const symbol of symbols) {
    const h = await loadAdjustedHistory(symbol, renames);
    if (!h || !h.delivered.some((x) => x != null)) continue;
    fn(symbol, stockSeries(h));
  }
}

// ── pass 1: pools, per-day medians, cut points ──
const pools: number[][][] = Array.from({ length: H }, () => days.map(() => []));
const levelByDate = new Map<string, number[]>();
const discoveryRel: number[] = [];
let eligibleDays = 0;
await each((_, s) => {
  s.dates.forEach((d, i) => {
    const day = dayIdx.get(d);
    if (day === undefined || !s.eligible[i]) return;
    eligibleDays++;
    for (let h = 0; h < H; h++) { const r = s.returns[h]![i]; if (r != null) pools[h]![day]!.push(r); }
    if (s.level[i] != null) (levelByDate.get(d) ?? levelByDate.set(d, []).get(d)!).push(s.level[i]!);
    if (d <= DISCOVERY_END && s.rel[i] != null) discoveryRel.push(s.rel[i]!);
  });
});
const dayMedians = pools.map((ph) => ph.map((v) => median(v)));
const relCuts = fifthCuts(discoveryRel);
const levelCuts = levelCutsByDate(levelByDate);

// ── pass 2: signals ──
// Positions are rebuilt in pass 1's order (same companies, same days), so an
// occasion knows which entry in its day's pool is itself.
const posCount = days.map(() => 0);
const occ: Occasion[][] = SIGNALS.map(() => []);
const nifty: Occasion[][] = SIGNALS.map(() => []);
const byFifth: number[][] = [[], [], [], [], []];
let stocksUsed = 0;
await each((symbol, s) => {
  stocksUsed++;
  const pos = s.dates.map((d, i) => {
    const day = dayIdx.get(d);
    if (day === undefined || !s.eligible[i] || s.returns[MAIN]![i] == null) return -1;
    return posCount[day]!++;
  });
  s.dates.forEach((d, i) => {
    const day = dayIdx.get(d);
    const r = s.returns[MAIN]![i];
    if (day === undefined || !s.eligible[i] || r == null || s.rel[i] == null || d > DISCOVERY_END) return;
    byFifth[fifthOf(s.rel[i]!, relCuts)]!.push(r - dayMedians[MAIN]![day]!);
  });
  const member = memberFlags(s.dates, windows.get(symbol) ?? [], "2020-01-01");
  signalFlags(s, relCuts, (d) => levelCuts.get(d)).forEach((flags, k) => {
    for (const o of occasionsOf(flags, s, (d) => dayIdx.get(d) ?? -1, (i) => pos[i]!)) {
      if (o.day < 0) continue;
      occ[k]!.push(o);
      if (member[s.dates.indexOf(o.date)]) nifty[k]!.push(o);
    }
  });
});

const results: DeliveryResult[] = SIGNALS.map((name, k) => {
  const all = occ[k]!;
  return deliveryVerdict(
    name,
    part(all.filter((o) => o.date <= DISCOVERY_END), pools, MAIN),
    part(all.filter((o) => o.date > DISCOVERY_END), pools, MAIN),
    MAIN,
  );
});

// ── print ──
const luck = (l: { beat: number; direction: string } | null) => (l ? `${l.beat.toFixed(1)}% (${l.direction})` : "—");
p(`Generated ${new Date().toISOString().slice(0, 10)} · ${stocksUsed} companies with delivery data · ${eligibleDays.toLocaleString("en-IN")} eligible stock-days · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
p();
p("## Results (main span: 1 month; discovery 2016–2022, hold-out 2023–)");
p();
p("| Signal | Episodes | Months | Median | Same days, all stocks | Beats random | Same way | Effect | Hold-out episodes | Hold-out median | Hold-out baseline | Hold-out beats | Verdict |");
p("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of results) {
  const d = r.discovery, h = r.holdout;
  p(`| ${r.name} | ${d.n} | ${d.months} | ${f(d.medians[MAIN]!)}% | ${f(d.baseline[MAIN]!)}% | ${luck(d.luck)} | ${r.same} of 4 | ${f(r.effect, 2)} pts | ${h.n} | ${f(h.medians[MAIN]!)}% | ${f(h.baseline[MAIN]!)}% | ${luck(h.luck)} | ${r.verdict} |`);
}
p();
p("## Every span (discovery medians vs same-days baseline)");
p();
p(`| Signal | ${LABELS.join(" | ")} |`);
p(`|---|${LABELS.map(() => "---").join("|")}|`);
for (const r of results) {
  p(`| ${r.name} | ${STUDY_HORIZONS.map((_, h) => `${f(r.discovery.medians[h]!)} vs ${f(r.discovery.baseline[h]!)}`).join(" | ")} |`);
}
p();
p("## Delivery against its own normal, by fifth (discovery, 1 month, return minus that day's median stock)");
p();
p("| Fifth of rel | Stock-days | Median vs the day's typical stock |");
p("|---|---|---|");
byFifth.forEach((v, k) => p(`| ${["Bottom", "Second", "Middle", "Fourth", "Top"][k]} | ${v.length.toLocaleString("en-IN")} | ${f(median(v), 2)} pts |`));
p();
p("## NIFTY 50 members only (from 2020, all years, for context; no verdicts)");
p();
p("| Signal | Episodes | Median, 1 month | Same days, all stocks |");
p("|---|---|---|---|");
SIGNALS.forEach((name, k) => {
  const pt = part(nifty[k]!, pools, MAIN);
  p(`| ${name} | ${pt.n} | ${f(pt.medians[MAIN]!)}% | ${f(pt.baseline[MAIN]!)}% |`);
});
p();
p(`Cut points for "well above / below its own normal" (discovery): ${relCuts.map((c) => c.toFixed(1)).join(", ")} points.`);

console.log(out.join("\n"));
await sql.end();
