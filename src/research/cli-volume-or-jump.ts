/**
 * Runs research 0005 (volume or the jump?) and prints it as Markdown; `--json <file>`
 * also writes the charts' data. Two passes, like research 0003/0004: pass 1 builds each
 * day's median return and size cut points, pass 2 the matched groups and the daily
 * Fama–MacBeth fits.
 *   bun run research:volume-or-jump > out.md
 *   bun run research:volume-or-jump -- --json chart-data.json
 */
import { writeFileSync } from "node:fs";
import { sql } from "../db";
import { loadAdjustedHistory, loadRenames } from "../indicators/history";
import { median } from "../indicators/signals";
import { allFundSymbols, companies } from "../indicators/universe";
import { STUDY_HORIZONS, episodeStarts, sameWay } from "./volume";
import { tradingDays } from "./delivery-data";
import { DISCOVERY_END, part, type Occasion, type Part } from "./delivery";
import { CHART_HORIZONS, effectOf, volumeSeries } from "./volume-market";
import {
  FM_T, JUMP_FLOOR, SETTLED_BELOW, alignToPools, excludeSelf, Q1_BANDS, Q2_BANDS, addRow, bandOf, breakoutFlags, droppedCount, groupKey, jumpFlags,
  medianTurnover, neweyWest, normalEq, prevReturn, solveEq, thirdCuts, thirdOf, verdict5, type NormalEq,
} from "./volume-or-jump";

const START = "2016-09-28";
const SPAN_C = STUDY_HORIZONS.map((h) => CHART_HORIZONS.indexOf(h as (typeof CHART_HORIZONS)[number]));
const MAIN_V = STUDY_HORIZONS.indexOf(21);
const V = STUDY_HORIZONS.length;
const FM_MIN = 100; // stocks per day for a daily fit
const FM_LAGS = 20;
const FM_K = 5; // [1, ln(vol ratio), move, previous 21-session return, ln(median turnover)]
const jsonAt = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : null;
const f = (v: number | null | undefined, d = 1) =>
  v == null ? "—" : Math.abs(v) < 0.5 * 10 ** -d ? (0).toFixed(d) : `${v > 0 ? "+" : ""}${v.toFixed(d)}`;
const clean = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : v);
const out: string[] = [];
const p = (line = "") => out.push(line);
const t0 = Date.now();

const funds = await allFundSymbols();
const [renames, symbols, days, sectorRows] = await Promise.all([
  loadRenames(), companies(funds), tradingDays(START),
  sql<{ symbol: string; industry: string }[]>`select symbol, industry from index_constituents where index_key = 'total-market'`,
]);
const sector = new Map(sectorRows.map((r) => [r.symbol, r.industry]));
const dayIdx = new Map(days.map((d, i) => [d, i]));

type Prepared = ReturnType<typeof volumeSeries> & { symbol: string; size: (number | null)[]; prev21: (number | null)[] };
async function each(fn: (s: Prepared) => void) {
  for (const symbol of symbols) {
    const h = await loadAdjustedHistory(symbol, renames);
    if (!h) continue;
    const s = volumeSeries(h);
    const mt = medianTurnover(h.turnover, h.dates);
    fn({ ...s, symbol, size: mt.map((v) => (v != null && v > 0 ? Math.log(v) : null)), prev21: prevReturn(s.close, s.dates, 21) });
  }
}

// pass 1: each day's eligible returns (for its median) and sizes (for its thirds)
const pools: number[][][] = SPAN_C.map(() => days.map(() => []));
const sizes: number[][] = days.map(() => []);
let eligibleDays = 0, companiesEligible = 0;
await each((s) => {
  if (s.eligible.some(Boolean)) companiesEligible++;
  s.dates.forEach((d, i) => {
    const day = dayIdx.get(d);
    if (day === undefined || !s.eligible[i]) return;
    eligibleDays++;
    SPAN_C.forEach((c, v) => { const r = s.returns[c]![i]; if (r != null) pools[v]![day]!.push(r); });
    if (s.size[i] != null) sizes[day]!.push(s.size[i]!);
  });
});
const dayMedian = pools.map((byDay) => byDay.map((r) => median(r)));
const cuts = sizes.map((v) => (v.length >= 3 ? thirdCuts(v) : null));
pools.length = 0; // pass 2 needs only the medians

// pass 2: matched groups (per question, and with sector added) and daily regressions
// ctrlSym[g] runs parallel to controls[MAIN_V][g]: which stock each 1-month control came from
type Study = { groups: Map<string, number>; controls: number[][][]; ctrlSym: string[][]; occ: (Occasion & { band: number; symbol: string })[] };
const study = (): Study => ({ groups: new Map(), controls: SPAN_C.map(() => []), ctrlSym: [], occ: [] });
const Q = { jump: study(), breakout: study(), jumpSector: study(), breakoutSector: study(), jumpTm: study(), breakoutTm: study() };
const fm: NormalEq[] = days.map(() => normalEq(FM_K));
const groupOf = (st: Study, key: string) => {
  let g = st.groups.get(key);
  if (g === undefined) {
    g = st.groups.size; st.groups.set(key, g);
    st.controls.forEach((c) => c.push([]));
    st.ctrlSym.push([]);
  }
  return g;
};

await each((s) => {
  const sec = sector.get(s.symbol);
  const excess = s.dates.map((d, i) => {
    const day = dayIdx.get(d);
    return SPAN_C.map((c, v) => {
      const r = s.returns[c]![i], m = day === undefined ? null : dayMedian[v]![day];
      return r == null || m == null ? null : r - m;
    });
  });
  // mode: whole universe; Nifty Total Market stocks only; Total Market with sector in the group
  const place = (st: Study, flags: { signal: boolean[]; control: boolean[] }, bands: readonly number[], floor: number | null, mode: "all" | "tm" | "sector" = "all") => {
    if (mode !== "all" && !sec) return;
    const withSector = mode === "sector";
    const groupAt = (i: number): [number, number] | null => {
      const day = dayIdx.get(s.dates[i]!);
      const band = bandOf(s.move[i] ?? null, bands, floor);
      const c = day === undefined ? null : cuts[day];
      if (day === undefined || band === null || c == null || s.size[i] == null) return null;
      return [groupOf(st, groupKey(s.dates[i]!, band, thirdOf(s.size[i]!, c), withSector ? sec : undefined)), band];
    };
    flags.control.forEach((on, i) => {
      if (!on) return;
      const g = groupAt(i);
      if (g) excess[i]!.forEach((e, v) => {
        if (e == null) return;
        st.controls[v]![g[0]]!.push(e);
        if (v === MAIN_V) st.ctrlSym[g[0]]!.push(s.symbol);
      });
    });
    for (const i of episodeStarts(flags.signal)) {
      const g = groupAt(i);
      if (g) st.occ.push({ date: s.dates[i]!, day: g[0], pos: -1, returns: excess[i]!, band: g[1], symbol: s.symbol });
    }
  };
  const jf = jumpFlags(s), bf = breakoutFlags(s);
  place(Q.jump, jf, Q1_BANDS, JUMP_FLOOR);
  place(Q.breakout, bf, Q2_BANDS, null);
  place(Q.jumpSector, jf, Q1_BANDS, JUMP_FLOOR, "sector");
  place(Q.breakoutSector, bf, Q2_BANDS, null, "sector");
  place(Q.jumpTm, jf, Q1_BANDS, JUMP_FLOOR, "tm");
  place(Q.breakoutTm, bf, Q2_BANDS, null, "tm");

  // Fama–MacBeth rows: every eligible up day with all inputs and a 1-month outcome
  s.dates.forEach((d, i) => {
    const day = dayIdx.get(d);
    const vr = s.volRatio[i], mv = s.move[i], pr = s.prev21[i], sz = s.size[i], y = excess[i]![MAIN_V];
    if (day === undefined || !s.eligible[i] || vr == null || vr <= 0 || mv == null || mv <= 0 || pr == null || sz == null || y == null) return;
    addRow(fm[day]!, [1, Math.log(vr), mv, pr, sz], y);
  });
});

// results
type Res = { disc: Part; hold: Part; dropped: { disc: number; hold: number }; signals: number };
function compare(st: Study, filter: (o: Study["occ"][number]) => boolean = () => true): Res {
  const pick = (inDisc: boolean) => st.occ.filter((o) => filter(o) && (o.date <= DISCOVERY_END) === inDisc);
  const matched = (occ: Occasion[]) => alignToPools(occ.filter((o) => (st.controls[MAIN_V]![o.day]?.length ?? 0) > 0), st.controls);
  const d = pick(true), h = pick(false);
  return {
    disc: part(matched(d), st.controls, MAIN_V), hold: part(matched(h), st.controls, MAIN_V),
    dropped: { disc: droppedCount(d, st.controls[MAIN_V]!), hold: droppedCount(h, st.controls[MAIN_V]!) },
    signals: d.length + h.length,
  };
}
const fit = (inDisc: boolean) => {
  const coef: number[][] = [];
  let skipped = 0;
  fm.forEach((acc, day) => {
    if ((days[day]! <= DISCOVERY_END) !== inDisc || acc.n === 0) return;
    if (acc.n < FM_MIN) { skipped++; return; }
    const b = solveEq(acc);
    if (b) coef.push(b); else skipped++;
  });
  const term = (k: number) => neweyWest(coef.map((b) => b[k]!), FM_LAGS);
  return { days: coef.length, skipped, vol: term(1), move: term(2), prev: term(3), size: term(4) };
};
const fmDisc = fit(true), fmHold = fit(false);
const q1 = compare(Q.jump), q2 = compare(Q.breakout);
const v1 = verdict5({ disc: q1.disc, hold: q1.hold, main: MAIN_V, fmT: fmDisc.vol?.t ?? null, fmB: fmDisc.vol?.mean ?? null, needFm: true });
const v2 = verdict5({ disc: q2.disc, hold: q2.hold, main: MAIN_V, fmT: null, fmB: null, needFm: false });
const eff = (pt: Part, v = MAIN_V) => effectOf(pt.medians[v], pt.baseline[v]);
const bandLabel = (cutsList: readonly number[], floor: number | null, b: number) => {
  const edges = floor !== null ? [...cutsList] : [null, ...cutsList];
  const lo = edges[b], hi = edges[b + 1];
  return lo == null ? `under +${hi}%` : hi == null ? `+${lo}% or more` : `+${lo} to +${hi}%`;
};
const bands = (st: Study, cutsList: readonly number[], floor: number | null) =>
  Array.from({ length: cutsList.length + (floor !== null ? 0 : 1) }, (_, b) => {
    const r = compare(st, (o) => o.band === b);
    return { band: bandLabel(cutsList, floor, b), n: r.disc.n, effect: clean(eff(r.disc)), holdN: r.hold.n, holdEffect: clean(eff(r.hold)) };
  });
const q1Bands = bands(Q.jump, Q1_BANDS, JUMP_FLOOR), q2Bands = bands(Q.breakout, Q2_BANDS, null);
// side check added after the independent review: controls from the signal's own stock removed (1 month only)
function selfExcluded(st: Study) {
  const one = (inDisc: boolean) => {
    const occ = st.occ.filter((o) => (o.date <= DISCOVERY_END) === inDisc && (st.controls[MAIN_V]![o.day]?.length ?? 0) > 0);
    const r = excludeSelf(occ, st.controls[MAIN_V]!, st.ctrlSym);
    const pt = part(r.occ, SPAN_C.map((_, v) => (v === MAIN_V ? r.pools : r.pools.map(() => []))), MAIN_V);
    return { n: pt.n, dropped: r.dropped, effect: clean(eff(pt)), beat: clean(pt.luck?.beat) };
  };
  const disc = one(true), hold = one(false);
  const under = disc.effect !== null && hold.effect !== null && Math.abs(disc.effect) < SETTLED_BELOW && Math.abs(hold.effect) < SETTLED_BELOW;
  return { disc, hold, under };
}
const x1 = selfExcluded(Q.jump), x2 = selfExcluded(Q.breakout);
const s1 = compare(Q.jumpSector), s2 = compare(Q.breakoutSector);
const t1 = compare(Q.jumpTm), t2 = compare(Q.breakoutTm); // added after the first run, to explain s1/s2

// print
const luck = (l: { beat: number; direction: string } | null) => (l ? `${l.beat.toFixed(1)}% (${l.direction})` : "—");
const NAMES = ["Q1. Huge-volume jumps (≥ 5×) vs ordinary-volume jumps (< 1.5×), same jump size", "Q2. Heavy-volume breakouts (≥ 2×) vs light-volume breakouts (< 1.5×), same jump size"];
p(`Generated ${new Date().toISOString().slice(0, 10)} · ${companiesEligible} companies took part · ${eligibleDays.toLocaleString("en-IN")} eligible stock-days · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
p();
p("## Matched comparison (1 month = 21 sessions; excess over the day's typical stock; discovery 2016–2022, hold-out 2023–)");
p();
p("| Question | Signal days matched | Left out (no control in group) | Median signal | Median matched control | Beats controls | Same way | Effect | 2023– matched | 2023– effect | 2023– beats | Verdict |");
p("|---|---|---|---|---|---|---|---|---|---|---|---|");
[[q1, v1], [q2, v2]].forEach(([r, v], k) => {
  const { disc: d, hold: h } = r as Res;
  p(`| ${NAMES[k]} | ${d.n} | ${(r as Res).dropped.disc} (+${(r as Res).dropped.hold} in 2023–) | ${f(d.medians[MAIN_V])}% | ${f(d.baseline[MAIN_V])}% | ${luck(d.luck)} | ${sameWay(d.medians, d.baseline, MAIN_V)} of 4 | ${f(eff(d), 2)} pts | ${h.n} | ${f(eff(h), 2)} pts | ${luck(h.luck)} | ${v}${k === 1 ? " (one method)" : ""} |`);
});
p();
p("## Gap at each span (signal median − matched control median, pts)");
p();
p(`| Question | ${STUDY_HORIZONS.map((h) => `${h}d`).join(" | ")} |`);
p(`|---|${STUDY_HORIZONS.map(() => "---").join("|")}|`);
[["Q1 2016–22", q1.disc], ["Q1 2023–", q1.hold], ["Q2 2016–22", q2.disc], ["Q2 2023–", q2.hold]].forEach(([n, pt]) =>
  p(`| ${n} | ${STUDY_HORIZONS.map((_, v) => f(eff(pt as Part, v), 2)).join(" | ")} |`));
p();
p(`## Fama–MacBeth (Q1's second method): daily fits across eligible up days, ≥ ${FM_MIN} stocks, Newey–West ${FM_LAGS} lags`);
p();
p("| Term | 2016–22 average | t | 2023– average | t |");
p("|---|---|---|---|---|");
const term = (name: string, a: ReturnType<typeof neweyWest>, b: ReturnType<typeof neweyWest>, d = 3) =>
  p(`| ${name} | ${f(a?.mean, d)} | ${f(a?.t, 2)} | ${f(b?.mean, d)} | ${f(b?.t, 2)} |`);
term("**ln(volume ÷ normal)**", fmDisc.vol, fmHold.vol);
term("Day's move (per %)", fmDisc.move, fmHold.move);
term("Previous 21-session return (per %)", fmDisc.prev, fmHold.prev);
term("ln(median turnover)", fmDisc.size, fmHold.size);
p();
p(`Days fitted: ${fmDisc.days} (2016–22), ${fmHold.days} (2023–); skipped for fewer than ${FM_MIN} stocks or a singular fit: ${fmDisc.skipped}, ${fmHold.skipped}. Bar: |t| ≥ ${FM_T}.`);
p();
p("## Gap by jump size (1 month, pts)");
p();
p("| Question | Jump | Matched 2016–22 | Effect | Matched 2023– | Effect |");
p("|---|---|---|---|---|---|");
for (const b of q1Bands) p(`| Q1 | ${b.band} | ${b.n} | ${f(b.effect, 2)} | ${b.holdN} | ${f(b.holdEffect, 2)} |`);
for (const b of q2Bands) p(`| Q2 | ${b.band} | ${b.n} | ${f(b.effect, 2)} | ${b.holdN} | ${f(b.holdEffect, 2)} |`);
p();
p("## Side check after review: the signal's own stock removed from its controls (1 month)");
p();
p("A control can be the same stock on another day in the same month (e.g. it crossed again on light volume a week later); the two returns overlap. This check, added after the independent review, removes them. It decides nothing; the verdicts above follow the fixed rules.");
p();
p("| Question | Matched 2016–22 | Effect | Beats | Matched 2023– | Effect | Beats | Both under 0.3 pts? |");
p("|---|---|---|---|---|---|---|---|");
[["Q1", x1], ["Q2", x2]].forEach(([n, r]) => {
  const x = r as ReturnType<typeof selfExcluded>;
  p(`| ${n} | ${x.disc.n} | ${f(x.disc.effect, 2)} | ${x.disc.beat?.toFixed(1) ?? "—"}% | ${x.hold.n} | ${f(x.hold.effect, 2)} | ${x.hold.beat?.toFixed(1) ?? "—"}% | ${x.under ? "yes" : "no"} |`);
});
p();
p("## Secondary: sector added to the groups (Nifty Total Market stocks only; no verdict)");
p();
p("Rows marked † were added after the first run, to tell apart the two reasons the sector rows could differ from the main result: the smaller set of stocks, or the finer groups.");
p();
p("| Question | Matched 2016–22 | Left out | Effect | Beats | Matched 2023– | Effect |");
p("|---|---|---|---|---|---|---|");
[["Q1, Total Market, with sector", s1], ["Q1, Total Market, no sector †", t1], ["Q2, Total Market, with sector", s2], ["Q2, Total Market, no sector †", t2]].forEach(([n, r]) => {
  const x = r as Res;
  p(`| ${n} | ${x.disc.n} | ${x.dropped.disc} | ${f(eff(x.disc), 2)} | ${luck(x.disc.luck)} | ${x.hold.n} | ${f(eff(x.hold), 2)} |`);
});

if (jsonAt) {
  const qJson = (r: Res, verdict: string) => ({
    verdict, matched: r.disc.n, holdMatched: r.hold.n, dropped: r.dropped,
    effect: clean(eff(r.disc)), holdEffect: clean(eff(r.hold)),
    beat: clean(r.disc.luck?.beat), holdBeat: clean(r.hold.luck?.beat),
    spans: STUDY_HORIZONS.map((h, v) => ({ sessions: h, disc: clean(eff(r.disc, v)), hold: clean(eff(r.hold, v)) })),
  });
  const nw = (x: ReturnType<typeof neweyWest>) => (x ? { mean: clean(x.mean), se: clean(x.se), t: clean(x.t) } : null);
  writeFileSync(jsonAt, JSON.stringify({
    generated: new Date().toISOString().slice(0, 10), companies: companiesEligible, eligibleDays,
    q1: { ...qJson(q1, v1), bands: q1Bands }, q2: { ...qJson(q2, v2), bands: q2Bands },
    fm: Object.fromEntries(([["disc", fmDisc], ["hold", fmHold]] as const).map(([k, x]) =>
      [k, { days: x.days, skipped: x.skipped, vol: nw(x.vol), move: nw(x.move), prev: nw(x.prev), size: nw(x.size) }])),
    fmBar: FM_T,
    selfExcluded: { q1: x1, q2: x2 },
    secondary: Object.fromEntries(([["q1Sector", s1], ["q1Tm", t1], ["q2Sector", s2], ["q2Tm", t2]] as const).map(([k, r]) => [k, { matched: r.disc.n, effect: clean(eff(r.disc)), holdEffect: clean(eff(r.hold)), beat: clean(r.disc.luck?.beat) }])),
  }, null, 2));
}
console.log(out.join("\n"));
await sql.end();
