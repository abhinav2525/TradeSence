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

// ── Lights 6–8 (decision 0014), written again from the spec, sharing no app code ──
function ewma(l: Pt[]): (number | null)[] {
  const out: (number | null)[] = []; let v: number | null = null; let buf: number[] = []; let seg = -1;
  l.forEach((p, i) => {
    if (p.seg !== seg) { seg = p.seg; buf = []; v = null; out.push(null); return; }
    const r = (p.level / l[i - 1]!.level - 1) * 100;
    if (v === null) { buf.push(r); if (buf.length === 20) { const m = buf.reduce((a, b) => a + b, 0) / 20; v = buf.reduce((a, b) => a + (b - m) ** 2, 0) / 19; } }
    else v = 0.94 * v + 0.06 * r * r;
    out.push(v === null ? null : Math.sqrt(v));
  });
  return out;
}
function hits(l: Pt[], s: (number | null)[]) {
  let inside = 0, of = 0;
  for (let t = Math.max(0, l.length - 500); t + 5 < l.length; t++) {
    if (s[t] == null || l[t]!.seg !== l[t + 5]!.seg) continue;
    of++; if (Math.abs((l[t + 5]!.level / l[t]!.level - 1) * 100) <= s[t]! * Math.sqrt(5) + 1e-9) inside++;
  }
  return of < 100 ? null : { inside, of };
}
function capture(l: Pt[], nifty: { d: string; c: number }[]) {
  const nm = new Map<string, number>();
  nifty.forEach((x, i) => { if (i > 0) nm.set(x.d, (x.c / nifty[i - 1]!.c - 1) * 100); });
  const pairs: { s: number; m: number }[] = [];
  l.forEach((p, i) => { if (i > 0 && p.seg === l[i - 1]!.seg && nm.has(p.d)) pairs.push({ s: (p.level / l[i - 1]!.level - 1) * 100, m: nm.get(p.d)! }); });
  const w = pairs.slice(-250);
  if (w.length < 120) return null;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const ms = avg(w.map((p) => p.s)), mm = avg(w.map((p) => p.m));
  const beta = w.reduce((a, p) => a + (p.s - ms) * (p.m - mm), 0) / w.reduce((a, p) => a + (p.m - mm) ** 2, 0);
  const up = w.filter((p) => p.m > 1e-9), dn = w.filter((p) => p.m < -1e-9);
  return { beta, up: (avg(up.map((p) => p.s)) / avg(up.map((p) => p.m))) * 100, down: (avg(dn.map((p) => p.s)) / avg(dn.map((p) => p.m))) * 100 };
}

function crashes(l: Pt[], nifty: { d: string; c: number }[], upto: string) {
  const b = breadthAll.filter((x) => x.d <= upto);
  const raw: number[] = []; let last = -Infinity;
  b.forEach((x, i) => { if (x.pct < 20) { if (i - last - 1 > 10) raw.push(i); last = i; } });
  const starts: number[] = []; for (const i of raw) if (!starts.length || i - starts[starts.length - 1]! > 63) starts.push(i);
  const si = new Map(l.map((p, i) => [p.d, i])), ni = new Map(nifty.map((x, i) => [x.d, i]));
  // high in the 63 sessions up to the start → low in the 63 after
  const fall = (lv: (k: number) => number, seg: (k: number) => number, i: number | undefined, len: number) => {
    if (i === undefined || i < 63 || i + 63 > len - 1 || seg(i - 63) !== seg(i + 63)) return null;
    let hi = -Infinity, lo = Infinity;
    for (let k = i - 63; k <= i; k++) hi = Math.max(hi, lv(k));
    for (let k = i; k <= i + 63; k++) lo = Math.min(lo, lv(k));
    return Math.min(0, (lo / hi - 1) * 100);
  };
  const eps: { start: string; s: number; n: number; back: boolean | null }[] = []; let ongoing: string | null = null;
  for (const i of starts) {
    const start = b[i]!.d;
    if (i + 63 > b.length - 1) { ongoing = start; continue; }
    const j = si.get(start);
    const s = fall((k) => l[k]!.level, (k) => l[k]!.seg, j, l.length);
    const n = fall((k) => nifty[k]!.c, () => 0, ni.get(start), nifty.length);
    if (s === null || n === null) continue;
    const back = j! + 126 <= l.length - 1 && l[j! + 126]!.seg === l[j!]!.seg ? (l[j! + 126]!.level / l[j!]!.level - 1) * 100 >= -1e-9 : null;
    eps.push({ start, s, n, back });
  }
  const med = (xs: number[]) => { const v = [...xs].sort((p, q) => p - q), h = v.length / 2; return v.length % 2 ? v[Math.floor(h)]! : (v[h - 1]! + v[h]!) / 2; };
  const ratios = eps.filter((e) => e.n < -1e-9).map((e) => e.s / e.n);
  return { eps, ongoing, ms: eps.length ? med(eps.map((e) => e.s)) : null, mn: eps.length ? med(eps.map((e) => e.n)) : null, ratio: ratios.length ? med(ratios) : null };
}

const [{ d: latest }] = await db.execute<{ d: string }>(sql`select max(trade_date)::text d from daily_prices`);
const today = process.argv[2] ?? latest;
const members = (await db.execute<{ s: string }>(sql`select symbol s from index_members where index_name='NIFTY50' and added_on <= ${today} and (removed_on is null or removed_on > ${today}) order by symbol`)).map((r) => r.s);
const lines = new Map<string, Pt[]>();
for (const m of members) lines.set(m, await line(m, today));

// Breadth rebuilt from raw prices: a member is "above" when its adjusted level is above
// the mean of its last 200 levels in the same segment (= close > stored SMA 200).
const memRows = await db.execute<{ s: string; a: string; r: string | null }>(sql`
  select symbol s, added_on::text a, removed_on::text r from index_members where index_name = 'NIFTY50'`);
const everSyms = [...new Set(memRows.map((x) => x.s))];
const counts = new Map<string, { above: number; total: number }>();
for (const s of everSyms) {
  const l = lines.get(s) ?? (await line(s, today));
  const spans = memRows.filter((x) => x.s === s);
  let sum = 0;
  l.forEach((p, i) => {
    sum += p.level;
    if (i >= 200) sum -= l[i - 200]!.level;
    if (i < 199 || l[i - 199]!.seg !== p.seg) return;
    if (!spans.some((x) => p.d >= x.a && (x.r === null || p.d < x.r))) return;
    const c = counts.get(p.d) ?? { above: 0, total: 0 };
    c.total++; if (p.level > sum / 200) c.above++;
    counts.set(p.d, c);
  });
}
const breadthAll = [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([d, c]) => ({ d, pct: (c.above / c.total) * 100 }));
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
  const niftyRows = (await db.execute<{ d: string; c: number }>(sql`select trade_date::text d, close c from index_prices where index_name='Nifty 50' and trade_date between ${l[0]!.d} and ${r.date} order by 1`)).map((x) => ({ d: x.d, c: Number(x.c) }));
  const nifty = niftyRows.map((x) => x.c);
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
  const sg = ewma(l), sigma = sg.at(-1) ?? null;
  cmp(m, "rightNow sigma", sigma, r.rightNow.sigma);
  const myVol = vol(moves(l));
  const yearOfMoves = moves(l).filter((x) => x !== null).length >= 250;
  cmp(m, "rightNow ratio", yearOfMoves && sigma !== null && myVol ? sigma / myVol : null, r.rightNow.ratio);
  const h5 = hits(l, sg);
  cmp(m, "rightNow inside", h5?.inside ?? null, r.rightNow.hit?.inside); cmp(m, "rightNow of", h5?.of ?? null, r.rightNow.hit?.of);
  const cp = capture(l, niftyRows);
  cmp(m, "beta", cp?.beta ?? null, r.badDays.capture?.beta); cmp(m, "up capture", cp?.up ?? null, r.badDays.capture?.up); cmp(m, "down capture", cp?.down ?? null, r.badDays.capture?.down);
  const cr = crashes(l, niftyRows, r.date);
  const mine = cr.eps.map((e) => e.start).join(","), app = r.crashes.episodes.map((e) => e.start).join(",");
  if (mine !== app) mism.push(`${m} crash starts: mine=${mine} app=${app}`);
  if (cr.ongoing !== r.crashes.ongoing) mism.push(`${m} crash ongoing: mine=${cr.ongoing} app=${r.crashes.ongoing}`);
  cmp(m, "crash median stock", cr.ms, r.crashes.medianStock); cmp(m, "crash median NIFTY", cr.mn, r.crashes.medianNifty);
  cmp(m, "crash back", cr.eps.filter((e) => e.back).length, r.crashes.backCount);
  cmp(m, "crash ratio", cr.ratio, r.crashes.ratio);
  cr.eps.forEach((e, i) => {
    const x = r.crashes.episodes[i];
    cmp(m, `crash ${e.start} stock fall`, e.s, x?.stockFall); cmp(m, `crash ${e.start} NIFTY fall`, e.n, x?.niftyFall);
    if (e.back !== (x?.back ?? null)) mism.push(`${m} crash ${e.start} back: mine=${e.back} app=${x?.back}`);
  });
}
console.log(`session ${today} · ${members.length} members · ${checked} numbers compared · ${mism.length} mismatches`);
for (const x of mism) console.log("  ✗", x);
if (mism.length === 0) console.log("✓ every number matches the independent recalculation");
process.exit(mism.length ? 1 : 0);
