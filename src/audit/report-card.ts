/**
 * `bun run audit:report-card [YYYY-MM-DD]`: an INDEPENDENT recalculation of every
 * Report Card number, for every member, compared with stockReport() (decision 0013).
 *
 * It deliberately shares no code with the app: it reads raw bhavcopy rows
 * (daily_prices), follows renames and applies splits, bonuses and demergers itself,
 * and never touches daily_indicators or src/indicators. Two implementations written
 * differently rarely share a bug. Definitions (126 sessions = 6 months, the 10th
 * percentile's interpolation…) follow decision 0011; this checks data and arithmetic.
 * Exits 1 on any mismatch.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { stockReport } from "../query/stock-report";

const MAX_GAP = 21, SHARE = ["split", "bonus", "bonus+split", "consolidation"];
type Pt = { d: string; level: number; seg: number; close: number; turnover: number };
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 864e5;

const changes = (await db.execute<{ o: string; n: string; c: string }>(sql`select old_symbol o, new_symbol n, changed_on::text c from symbol_changes`)).map((r) => ({ ...r }));
function chain(sym: string, until: string | null = null): { sym: string; from: string | null; to: string | null }[] {
  // the latest rename INTO sym (before `until`) gives its start; recurse into the old symbol
  const into = changes.filter((c) => c.n === sym && (until === null || c.c < until)).sort((a, b) => (a.c < b.c ? 1 : -1))[0];
  if (!into || into.o === sym) return [{ sym, from: null, to: until }];
  return [{ sym, from: into.c, to: until }, ...chain(into.o, into.c)];
}

async function line(sym: string, upto: string): Promise<Pt[]> {
  const ch = chain(sym);
  const raw: { d: string; open: number; close: number; turnover: number }[] = [];
  for (const c of ch) {
    const rows = await db.execute<{ d: string; open: number; close: number; turnover: number }>(sql`
      select trade_date::text d, open, close, turnover from daily_prices
      where symbol = ${c.sym} and series = 'EQ' and trade_date <= ${upto}
        and (${c.from}::date is null or trade_date >= ${c.from}::date) and (${c.to}::date is null or trade_date < ${c.to}::date)`);
    raw.push(...rows.map((r) => ({ d: r.d, open: Number(r.open), close: Number(r.close), turnover: Number(r.turnover) })));
  }
  raw.sort((a, b) => (a.d < b.d ? -1 : 1));
  const syms = ch.map((c) => c.sym);
  const acts = await db.execute<{ d: string; kind: string; factor: number | null }>(sql`
    select ex_date::text d, kind, factor from corporate_actions where symbol in (${sql.join(syms.map((s) => sql`${s}`), sql`, `)})`);
  const out: Pt[] = [];
  let level = 100, seg = 0;
  raw.forEach((r, i) => {
    if (i > 0) {
      const p = raw[i - 1]!;
      if (days(p.d, r.d) > MAX_GAP) seg++;
      else {
        // actions whose ex-date falls after the previous session, up to this one
        const here = acts.filter((a) => a.d > p.d && a.d <= r.d);
        let f = 1; let demerged = false;
        for (const a of here) { if (SHARE.includes(a.kind) && a.factor) f *= Number(a.factor); if (a.kind === "demerger") demerged = true; }
        const base = demerged ? r.open : p.close; // demerger: last close ÷ ex-date open is the ratio
        level *= (r.close * f) / base;
      }
    }
    out.push({ d: r.d, level, seg, close: r.close, turnover: r.turnover });
  });
  return out;
}

const ret = (l: Pt[], n: number) => { const e = l.at(-1), s = l.at(-1 - n); return e && s && s.seg === e.seg ? (e.level / s.level - 1) * 100 : null; };
const moves = (l: Pt[]) => l.slice(1).map((p, i) => (p.seg === l[i]!.seg ? (p.level / l[i]!.level - 1) * 100 : null));
const sd = (xs: number[]) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };
const vol = (ms: (number | null)[]) => { const xs = ms.filter((x): x is number => x !== null).slice(-250); return xs.length >= 60 ? sd(xs) : null; };
function dd(l: { level: number; seg: number }[]) { let worst = 0, peak = 0; l.forEach((p, i) => { if (i === 0 || p.seg !== l[i - 1]!.seg || p.level >= l[peak]!.level) peak = i; worst = Math.min(worst, (p.level / l[peak]!.level - 1) * 100); }); return worst; }
function sma(l: Pt[], n: number) { const seg = l.at(-1)!.seg; const w = l.slice(-n); if (w.length < n || w[0]!.seg !== seg) return null; return (w.reduce((a, p) => a + p.level, 0) / n) * (l.at(-1)!.close / l.at(-1)!.level); }
function q(sorted: number[], p: number) { const pos = (sorted.length - 1) * p, lo = Math.floor(pos); return sorted[lo]! + (sorted[Math.ceil(pos)]! - sorted[lo]!) * (pos - lo); }
function horizon(l: { level: number; seg: number }[], n: number) {
  if (l.length < 3 * n) return null; const r: number[] = [];
  for (let i = n; i < l.length; i++) if (l[i - n]!.seg === l[i]!.seg) r.push((l[i]!.level / l[i - n]!.level - 1) * 100);
  const s = [...r].sort((a, b) => a - b); return { p10: q(s, 0.1), worst: s[0]!, neg: (r.filter((x) => x < -1e-9).length / r.length) * 100, n: r.length };
}

const [{ d: latest }] = await db.execute<{ d: string }>(sql`select max(trade_date)::text d from daily_prices`);
const today = process.argv[2] ?? latest;
const members = (await db.execute<{ s: string }>(sql`select symbol s from index_members where index_name='NIFTY50' and added_on <= ${today} and (removed_on is null or removed_on > ${today}) order by symbol`)).map((r) => r.s);
const lines = new Map<string, Pt[]>();
for (const m of members) lines.set(m, await line(m, today));
const peer6m = members.map((m) => ({ m, r: ret(lines.get(m)!, 126) })).filter((x): x is { m: string; r: number } => x.r !== null);

const mism: string[] = []; let checked = 0;
const cmp = (sym: string, what: string, mine: number | null, app: number | null | undefined, tol = 0.001) => {
  checked++;
  if (mine === null && (app === null || app === undefined)) return;
  if (mine === null || app === null || app === undefined) { mism.push(`${sym} ${what}: mine=${mine} app=${app}`); return; }
  const ok = Math.abs(mine - app) <= Math.max(tol * Math.abs(app), 0.005);
  if (!ok) mism.push(`${sym} ${what}: mine=${mine.toFixed(4)} app=${app.toFixed(4)}`);
};

for (const m of members) {
  const res = await stockReport(m, today);
  if (res.kind !== "ok") { mism.push(`${m}: app says ${res.kind}`); continue; }
  const r = res.report, l = lines.get(m)!;
  if (l.at(-1)!.d !== r.date) mism.push(`${m}: date mine=${l.at(-1)!.d} app=${r.date}`);
  if (l[0]!.d !== r.firstDate) mism.push(`${m}: firstDate mine=${l[0]!.d} app=${r.firstDate}`);
  const nifty = (await db.execute<{ d: string; c: number }>(sql`select trade_date::text d, close c from index_prices where index_name='Nifty 50' and trade_date between ${l[0]!.d} and ${r.date} order by 1`)).map((x) => Number(x.c));
  const nl = nifty.map((c) => ({ level: c, seg: 0 }));
  const nm = nifty.slice(1).map((c, i) => (c / nifty[i]! - 1) * 100);
  cmp(m, "close", l.at(-1)!.close, r.close);
  cmp(m, "sma50", sma(l, 50), r.trend.sma50);
  cmp(m, "sma200", sma(l, 200), r.trend.sma200);
  cmp(m, "ret6m", ret(l, 126), r.strength.ret6m);
  const my6 = ret(l, 126);
  // "stronger than X% of the OTHER members": self removed by name, and a gap smaller
  // than 1e-9 points is the same number computed twice, not a real difference
  const others = peer6m.filter((x) => x.m !== m);
  cmp(m, "percentile", my6 === null || !others.length ? null : (others.filter((x) => x.r < my6 - 1e-9).length / others.length) * 100, r.strength.percentile);
  cmp(m, "dailyVol", vol(moves(l)), r.bumpiness.dailyVol);
  cmp(m, "niftyVol", vol(nm), r.bumpiness.niftyVol);
  cmp(m, "worstFall", l.length >= 250 ? dd(l) : null, r.worstFall.stock?.depthPct ?? null);
  cmp(m, "niftyWorstFall", dd(nl), r.worstFall.nifty?.depthPct);
  const t = l.slice(-20).map((p) => p.turnover).sort((a, b) => a - b);
  cmp(m, "medianCrore", t[Math.floor((t.length - 1) / 2)]! / 1e7, r.liquidity.medianCrore);
  const h = horizon(l, 21), a = r.horizons["1m"].stock;
  cmp(m, "1m p10", h?.p10 ?? null, a?.p10); cmp(m, "1m worst", h?.worst ?? null, a?.worst); cmp(m, "1m shareNeg", h?.neg ?? null, a?.shareNegative);
  cmp(m, "1m windows", h?.n ?? null, a?.windows);
  const hy = horizon(l, 250), ay = r.horizons["1y"].stock;
  cmp(m, "1y p10", hy?.p10 ?? null, ay?.p10);
}
console.log(`session ${today} · ${members.length} members · ${checked} numbers compared · ${mism.length} mismatches`);
for (const x of mism) console.log("  ✗", x);
if (mism.length === 0) console.log("✓ every number matches the independent recalculation");
process.exit(mism.length ? 1 : 0);
