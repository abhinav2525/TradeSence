/**
 * Runs the forward-return study and prints it as Markdown.
 *
 *   bun run research:forward-returns > /tmp/out.md
 *
 * Breadth comes from breadthSeries, the same query the dashboard uses, so the
 * study and the page can never disagree about what breadth was.
 */
import { sql as q } from "drizzle-orm";
import { db, sql } from "../db";
import { breadthSeries, MA_LABELS, type MaKind } from "../query/breadth";
import {
  BUCKETS, HORIZONS, bucketOf, findEpisodes, forwardReturn, summarize, type Summary,
} from "./forward-returns";
import { MERGE_GAP } from "../indicators/episodes";

const INDEX = "Nifty 50";

const closesByDate = new Map(
  (await db.execute<{ d: string; close: number }>(
    q`select trade_date::text d, close from index_prices where index_name = ${INDEX}`,
  )).map((r) => [r.d, Number(r.close)]),
);

const f = (v: number | null, signed = true) =>
  v === null ? "—" : `${signed && v > 0 ? "+" : ""}${v.toFixed(1)}`;
const cell = (s: Summary) => (s.n === 0 ? "—" : `${f(s.mean)}% · ${f(s.pctPositive, false)}% up`);

const out: string[] = [];
const p = (line = "") => out.push(line);

for (const ma of ["sma200", "sma50", "ema200"] as MaKind[]) {
  const series = (await breadthSeries(ma)).filter((b) => closesByDate.has(b.date));
  const dates = series.map((b) => b.date);
  const pct = series.map((b) => b.pctAbove);
  const closes = dates.map((d) => closesByDate.get(d)!);

  p(`## ${MA_LABELS[ma]}`);
  p();
  p(`${dates.length} sessions, ${dates[0]} to ${dates.at(-1)}. Each cell: average NIFTY 50 return · share of times it was up.`);
  p();
  p(`| Breadth | Days | ${HORIZONS.map((h) => h.label).join(" | ")} |`);
  p(`|---|---|${HORIZONS.map(() => "---").join("|")}|`);
  const rowFor = (label: string, keep: (i: number) => boolean) => {
    const idx = dates.map((_, i) => i).filter(keep);
    const cells = HORIZONS.map((h) =>
      cell(summarize(idx.map((i) => forwardReturn(closes, i, h.sessions)).filter((v): v is number => v !== null))),
    );
    p(`| ${label} | ${idx.length} | ${cells.join(" | ")} |`);
  };
  for (const b of BUCKETS) rowFor(`${b}%`, (i) => bucketOf(pct[i]!) === b);
  rowFor("**All days (baseline)**", () => true);
  p();

  for (const [name, test] of [
    ["below 20%", (v: number) => v < 20],
    ["above 80%", (v: number) => v >= 80],
  ] as const) {
    const starts = findEpisodes(pct, test, MERGE_GAP);
    p(`**Episodes ${name}** (days within ${MERGE_GAP} sessions of each other count as one): ${starts.length}`);
    p();
    if (starts.length === 0) continue;
    p(`| Started | Breadth | ${HORIZONS.map((h) => h.label).join(" | ")} |`);
    p(`|---|---|${HORIZONS.map(() => "---").join("|")}|`);
    for (const i of starts) {
      const r = HORIZONS.map((h) => {
        const v = forwardReturn(closes, i, h.sessions);
        return v === null ? "not yet" : `${f(v)}%`;
      });
      p(`| ${dates[i]} | ${pct[i]!.toFixed(0)}% | ${r.join(" | ")} |`);
    }
    p();
  }
}

console.log(out.join("\n"));
await sql.end();
