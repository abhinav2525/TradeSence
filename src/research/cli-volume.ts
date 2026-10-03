/**
 * Runs research 0002 and prints it as Markdown.
 *
 *   bun run research:volume > /tmp/out.md
 *   bun run research:volume -- --check RELIANCE,INFY   # latest CMF/MFI, for the TradingView comparison
 *
 * Verdict rules are fixed in the spec before results: docs/superpowers/specs/2026-10-03-volume-study-design.md.
 */
import { sql } from "../db";
import { loadAdjustedHistory, loadRenames } from "../indicators/history";
import { forwardReturnSafe, median, segmentIds } from "../indicators/signals";
import { marketTurnover, memberWindows, niftyCloses, stockIndicators } from "./volume-data";
import {
  MIN_MARKET, MIN_STOCK, PANIC, SHARE_SMOOTH, STAMPEDE, STUDY_HORIZONS,
  adjustedBars, cmf, crossFlags, episodeStarts, excessReturn, fifthCuts, fifthOf, judge, memberFlags, mfi, obv,
  panicThenStampede, quietFlags, rollingMean, upShare, type Occasion, type TestResult,
} from "./volume";

const FROM = "2020-01-01";
const MARKET_MAIN = STUDY_HORIZONS.indexOf(63);
const STOCK_MAIN = STUDY_HORIZONS.indexOf(21);
const LABELS = ["1 week", "2 weeks", "1 month", "3 months", "6 months"];

// A value that rounds to zero prints as 0.0, never "-0.0".
const f = (v: number | null, d = 1) =>
  v === null ? "—" : Math.abs(v) < 0.5 * 10 ** -d ? (0).toFixed(d) : `${v > 0 ? "+" : ""}${v.toFixed(d)}`;
const out: string[] = [];
const p = (line = "") => out.push(line);

const check = process.argv.includes("--check") ? (process.argv[process.argv.indexOf("--check") + 1] ?? "").split(",") : null;

const [nifty, windows, renames, market] = await Promise.all([niftyCloses(), memberWindows(), loadRenames(), marketTurnover()]);

if (check) {
  for (const symbol of check) {
    const h = await loadAdjustedHistory(symbol, renames);
    if (!h) { console.log(`${symbol}: no data`); continue; }
    const b = adjustedBars(h);
    const i = b.close.length - 1;
    console.log(`${symbol} ${b.dates[i]}: CMF(20) ${cmf(b)[i]?.toFixed(4)}  MFI(14) ${mfi(b)[i]?.toFixed(2)}`);
  }
  await sql.end();
  process.exit(0);
}

// ── market-wide ──
const mDays = market.filter((d) => d.date >= FROM && nifty.has(d.date));
const mDates = mDays.map((d) => d.date);
const mSeg = segmentIds(mDates);
const mClose = mDates.map((d) => nifty.get(d)!);
const share = mDays.map((d) => upShare(d.up, d.down));
const share10 = rollingMean(mDates, share, SHARE_SMOOTH);
const mRet = (i: number) => STUDY_HORIZONS.map((h) => forwardReturnSafe(mClose, mSeg, i, h));
const mPool = STUDY_HORIZONS.map((h) => mDates.map((_, i) => forwardReturnSafe(mClose, mSeg, i, h)).filter((v): v is number => v !== null));
const s10Cuts = fifthCuts(share10.filter((v): v is number => v !== null));
const mOcc = (flags: boolean[]): Occasion[] => episodeStarts(flags).map((i) => ({ date: mDates[i]!, returns: mRet(i) }));

const results: TestResult[] = [
  judge("Panic day (≥ 90% of value into falling stocks)", "A", mOcc(share.map((s) => s !== null && s <= PANIC)), mPool, MARKET_MAIN, MIN_MARKET),
  judge("Stampede day (≥ 90% into rising stocks)", "A", mOcc(share.map((s) => s !== null && s >= STAMPEDE)), mPool, MARKET_MAIN, MIN_MARKET),
  judge("Panic then stampede within 10 sessions", "A", mOcc(panicThenStampede(mDates, share)), mPool, MARKET_MAIN, MIN_MARKET),
  judge("10-day up-volume share in its top fifth", "A", mOcc(share10.map((s) => s !== null && fifthOf(s, s10Cuts) === 4)), mPool, MARKET_MAIN, MIN_MARKET),
  judge("10-day up-volume share in its bottom fifth", "A", mOcc(share10.map((s) => s !== null && fifthOf(s, s10Cuts) === 0)), mPool, MARKET_MAIN, MIN_MARKET),
];

// ── per stock ──
type StockDay = { cmf: number | null; ex: (number | null)[] };
const stockTests: Record<string, { feeds: string; occ: Occasion[] }> = {
  "MFI under 20 (oversold)": { feeds: "B", occ: [] },
  "MFI over 80 (overbought)": { feeds: "B", occ: [] },
  "Quiet buying (price down, OBV up over 20 sessions)": { feeds: "B, C", occ: [] },
  "Quiet selling (price up, OBV down over 20 sessions)": { feeds: "B, C", occ: [] },
  "Cross above the 200-day SMA on heavy volume (≥ 2×)": { feeds: "C", occ: [] },
  "Cross above the 200-day SMA on light volume (< 1.5×)": { feeds: "C", occ: [] },
  "Cross below the 200-day SMA on heavy volume": { feeds: "C", occ: [] },
  "Cross below the 200-day SMA on light volume": { feeds: "C", occ: [] },
};
const perStock: { symbol: string; dates: string[]; member: boolean[]; days: StockDay[] }[] = [];
const sPool: number[][] = STUDY_HORIZONS.map(() => []);

for (const [symbol, win] of windows) {
  const h = await loadAdjustedHistory(symbol, renames);
  if (!h) continue;
  const b = adjustedBars(h);
  const seg = segmentIds(b.dates);
  const member = memberFlags(b.dates, win, FROM);
  const c = cmf(b);
  const m = mfi(b);
  const q = quietFlags(b, obv(b));
  const ind = await stockIndicators(symbol);
  const x = crossFlags(
    b.dates,
    h.close, // raw close vs the stored average in each day's rupees: like for like
    b.dates.map((d) => ind.get(d)?.sma200 ?? null),
    b.dates.map((d) => ind.get(d)?.volRatio ?? null),
  );
  const days: StockDay[] = b.dates.map((_, i) => ({
    cmf: c[i] ?? null,
    ex: STUDY_HORIZONS.map((hz) => excessReturn(b.close, seg, b.dates, nifty, i, hz)),
  }));
  days.forEach((d, i) => { if (member[i]) d.ex.forEach((v, k) => { if (v !== null) sPool[k]!.push(v); }); });
  perStock.push({ symbol, dates: b.dates, member, days });

  const add = (name: string, flags: boolean[]) => {
    for (const i of episodeStarts(flags.map((fl, k) => fl && member[k]!))) {
      stockTests[name]!.occ.push({ date: b.dates[i]!, returns: days[i]!.ex });
    }
  };
  add("MFI under 20 (oversold)", m.map((v) => v !== null && v < 20));
  add("MFI over 80 (overbought)", m.map((v) => v !== null && v > 80));
  add("Quiet buying (price down, OBV up over 20 sessions)", q.buying);
  add("Quiet selling (price up, OBV down over 20 sessions)", q.selling);
  add("Cross above the 200-day SMA on heavy volume (≥ 2×)", x.aboveHeavy);
  add("Cross above the 200-day SMA on light volume (< 1.5×)", x.aboveLight);
  add("Cross below the 200-day SMA on heavy volume", x.belowHeavy);
  add("Cross below the 200-day SMA on light volume", x.belowLight);
}

// CMF fifths need cut points from every member-day first.
const cmfCuts = fifthCuts(perStock.flatMap((s) => s.days.filter((d, i) => s.member[i] && d.cmf !== null).map((d) => d.cmf!)));
for (const [name, k] of [["CMF(20) in its top fifth", 4], ["CMF(20) in its bottom fifth", 0]] as const) {
  const occ: Occasion[] = [];
  for (const s of perStock) {
    const flags = s.days.map((d, i) => s.member[i]! && d.cmf !== null && fifthOf(d.cmf, cmfCuts) === k);
    for (const i of episodeStarts(flags)) occ.push({ date: s.dates[i]!, returns: s.days[i]!.ex });
  }
  results.push(judge(name, "B", occ, sPool, STOCK_MAIN, MIN_STOCK));
}
for (const [name, t] of Object.entries(stockTests)) results.push(judge(name, t.feeds, t.occ, sPool, STOCK_MAIN, MIN_STOCK));

// ── print ──
p("## Summary");
p();
p(`Market-wide tests: NIFTY 50 return, main span 3 months. Per-stock tests: the stock's return minus the NIFTY 50's, main span 1 month. ${mDates.length} sessions, ${mDates[0]} to ${mDates.at(-1)}.`);
p();
p("| Test | Feeds | Episodes | Months | Median, main span | Any day | Beats random | Same way | Verdict |");
p("|---|---|---|---|---|---|---|---|---|");
for (const r of results) {
  const luck = r.luck ? `${r.luck.strength.toFixed(1)}% (${r.luck.direction})` : "—";
  p(`| ${r.name} | ${r.feeds} | ${r.n} | ${r.months} | ${f(r.medians[r.main]!)}% | ${f(r.baseline[r.main]!)}% | ${luck} | ${r.same} of 4 | **${r.verdict}** |`);
}
p();
p(`Rules (fixed before results): Build = at least ${MIN_MARKET} (market) / ${MIN_STOCK} (per stock) episodes, beats 97.5% of 1,000 random draws in its direction at the main span, and on the same side of an ordinary day at 3 or more of the other 4 spans. Maybe = same side at 3 or more but not Build.`);
p();
p("## Every span");
p();
for (const r of results) {
  p(`**${r.name}**: ${r.n} episodes in ${r.months} distinct months.`);
  p();
  p(`| | ${LABELS.join(" | ")} |`);
  p(`|---|${LABELS.map(() => "---").join("|")}|`);
  p(`| Median after the signal | ${r.medians.map((v) => `${f(v)}%`).join(" | ")} |`);
  p(`| Any day | ${r.baseline.map((v) => `${f(v)}%`).join(" | ")} |`);
  p();
}
p("## By fifth (every day counted, so neighbouring days overlap)");
p();
p("| Fifth | 10-day up-volume share → NIFTY 50, 3 months | CMF(20) → excess return, 1 month |");
p("|---|---|---|");
for (let k = 0; k < 5; k++) {
  const mv = share10.map((s, i) => (s !== null && fifthOf(s, s10Cuts) === k ? mRet(i)[MARKET_MAIN] : null)).filter((v): v is number => v != null);
  const sv = perStock.flatMap((s) => s.days.filter((d, i) => s.member[i] && d.cmf !== null && fifthOf(d.cmf, cmfCuts) === k).map((d) => d.ex[STOCK_MAIN]).filter((v): v is number => v != null));
  p(`| ${["Bottom", "2nd", "Middle", "4th", "Top"][k]} | ${f(median(mv))}% (${mv.length} days) | ${f(median(sv))}% (${sv.length} days) |`);
}
p();
p(`Fifth cut points: 10-day up-volume share ${s10Cuts.map((c) => c.toFixed(1)).join(" / ")}%; CMF ${cmfCuts.map((c) => c.toFixed(3)).join(" / ")}.`);

console.log(out.join("\n"));
await sql.end();
