/**
 * The Stock Report Card's data: one NIFTY 50 member (current or past), read
 * on or before a session. Everything comes from the adjusted daily moves, so
 * splits, demergers and renames can't fake a fall. Spec:
 * docs/superpowers/specs/2026-10-02-stock-report-card-design.md.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { symbolLineage } from "../ingest/symbol-changes";
import { WEEK, crashEpisodes, ewmaVolatility, marketCapture, rangeHitRate, type Capture, type Crashes } from "../indicators/market-risk";
import { breadthSeries } from "./breadth";
import {
  DRAWDOWN_MIN, HORIZONS, THRESHOLDS, VOL_WINDOW, downCaptureLight, nowVolLight, adjustedLine, closesToMoves, currentDrawdownPct, dailyVolatility,
  drawdownSeries, horizonStats, liquidityLight, periodReturn, rankAmongPeers, ratioLight,
  strengthLight, trendLight, worstDrawdown,
  type Drawdown, type HorizonKey, type HorizonStats, type Light,
} from "../indicators/risk";

const INDEX = "Nifty 50"; // NSE's name in index_prices
const SHARE_COUNT_KINDS = ["split", "bonus", "bonus+split", "consolidation", "demerger"];

export type HorizonPair = { stock: HorizonStats | null; nifty: HorizonStats | null };

export type StockReport = {
  symbol: string;
  date: string; // the session shown
  requested: string | null; // what the URL asked for
  snapped: boolean;
  prev: string | null;
  next: string | null;
  firstDate: string; // first session in the stock's history
  lastDate: string; // latest session loaded, for the date picker's upper bound
  membership: { addedOn: string; removedOn: string | null }[];
  close: number;
  trend: { light: Light | null; sma50: number | null; sma200: number | null; side200: "above" | "below" | null; sessions200: number };
  strength: { light: Light | null; percentile: number | null; peers: number; ret3m: number | null; ret6m: number | null; ret12m: number | null; nifty6m: number | null };
  bumpiness: { light: Light | null; dailyVol: number | null; niftyVol: number | null; ratio: number | null };
  worstFall: { light: Light | null; stock: Drawdown | null; nifty: Drawdown | null; ratio: number | null; currentPct: number | null };
  liquidity: { light: Light | null; medianCrore: number | null };
  rightNow: { light: Light | null; sigma: number | null; weekPct: number | null; ratio: number | null; hit: { inside: number; of: number } | null };
  badDays: { light: Light | null; capture: Capture | null };
  crashes: { light: Light | null } & Crashes;
  horizons: Record<HorizonKey, HorizonPair>;
  price: { date: string; close: number; sma200: number | null }[]; // adjusted, in the shown session's rupees
  drawdown: { date: string; pct: number }[];
  events: { date: string; kind: string; text: string }[];
  dividends12m: number;
};

export type StockReportResult =
  | { kind: "unknown" } // never a supported symbol → the page 404s
  | { kind: "no-data"; symbol: string; firstDate: string | null } // no session on or before the date
  | { kind: "ok"; report: StockReport };

export async function supportedStocks(indexName = "NIFTY50") {
  const rows = await db.execute<{ symbol: string; current: boolean }>(sql`
    select symbol, bool_or(removed_on is null) as current
    from index_members where index_name = ${indexName}
    group by symbol
    order by bool_or(removed_on is null) desc, symbol`);
  return rows.map((r) => ({ symbol: r.symbol, current: Boolean(r.current) }));
}

export async function stockReport(symbol: string, dateIso?: string, indexName = "NIFTY50"): Promise<StockReportResult> {
  const membership = (await db.execute<{ added_on: string; removed_on: string | null }>(sql`
    select added_on::text, removed_on::text from index_members
    where index_name = ${indexName} and symbol = ${symbol} order by added_on`))
    .map((m) => ({ addedOn: m.added_on, removedOn: m.removed_on }));
  if (membership.length === 0) return { kind: "unknown" };

  const all = await db.execute<{ d: string; close: number; sma_50: number | null; sma_200: number | null; change_pct: number | null; turnover: number | null }>(sql`
    select trade_date::text d, close, sma_50, sma_200, change_pct, turnover
    from daily_indicators where symbol = ${symbol} order by trade_date`);
  const firstDate = all[0]?.d ?? null;
  const upto = dateIso ? all.filter((r) => r.d <= dateIso) : all;
  if (upto.length === 0) return { kind: "no-data", symbol, firstDate };

  const cur = upto.at(-1)!;
  const date = cur.d;
  const idx = all.findIndex((r) => r.d === date);
  const prev = idx > 0 ? all[idx - 1]!.d : null;
  const next = idx < all.length - 1 ? all[idx + 1]!.d : null;

  const num = (v: number | null) => (v === null ? null : Number(v));
  const moves = upto.map((r) => ({ date: r.d, changePct: num(r.change_pct) }));
  const line = adjustedLine(moves);

  // NIFTY 50 over exactly the same span
  const niftyRows = (await db.execute<{ d: string; close: number }>(sql`
    select trade_date::text d, close from index_prices
    where index_name = ${INDEX} and trade_date between ${upto[0]!.d} and ${date} order by trade_date`))
    .map((r) => ({ date: r.d, close: Number(r.close) }));
  const niftyMoves = closesToMoves(niftyRows);
  const niftyLine = adjustedLine(niftyMoves);

  // Trend
  const sma50 = num(cur.sma_50), sma200 = num(cur.sma_200), close = Number(cur.close);
  let sessions200 = 0;
  const side200 = sma200 === null ? null : close > sma200 ? "above" : "below";
  for (let i = upto.length - 1; i >= 0 && side200; i--) {
    const s = num(upto[i]!.sma_200);
    if (s === null || (Number(upto[i]!.close) > s ? "above" : "below") !== side200) break;
    sessions200++;
  }

  // Strength: 6-month return vs NIFTY, ranked among members on the date
  const ret6m = periodReturn(line, 126);
  const nifty6m = periodReturn(niftyLine, 126);
  const peers = await db.execute<{ symbol: string; d: string; change_pct: number | null }>(sql`
    select i.symbol, i.trade_date::text d, i.change_pct
    from daily_indicators i
    where i.trade_date <= ${date}
      and i.trade_date > ${date}::date - 220
      and i.symbol in (select m.symbol from index_members m where m.index_name = ${indexName}
                        and ${date} >= m.added_on and (m.removed_on is null or ${date} < m.removed_on))
    order by i.symbol, i.trade_date`);
  const bySym = new Map<string, { date: string; changePct: number | null }[]>();
  for (const p of peers) {
    const list = bySym.get(p.symbol) ?? [];
    list.push({ date: p.d, changePct: num(p.change_pct) });
    bySym.set(p.symbol, list);
  }
  const peerReturns = [...bySym.entries()]
    .map(([sym, pts]) => ({ symbol: sym, value: periodReturn(adjustedLine(pts), 126) }))
    .filter((p): p is { symbol: string; value: number } => p.value !== null);
  const rank = ret6m === null ? null : rankAmongPeers(symbol, ret6m, peerReturns);
  const percentile = rank?.pct ?? null;

  // Bumpiness: last 250 sessions, stock vs NIFTY over the same span
  const dailyVol = dailyVolatility(moves.map((m) => m.changePct));
  const niftyVol = dailyVolatility(niftyMoves.map((m) => m.changePct));
  const volRatio = dailyVol !== null && niftyVol ? dailyVol / niftyVol : null;

  // Worst fall
  // under a year of history, "worst fall" would be read from a handful of sessions
  const ddStock = line.length >= DRAWDOWN_MIN ? worstDrawdown(line) : null;
  const ddNifty = worstDrawdown(niftyLine);
  const ddRatio = ddStock && ddNifty && ddNifty.depthPct < 0 ? ddStock.depthPct / ddNifty.depthPct : null;

  // Liquidity: median ₹ turnover, last 20 sessions, in crore
  const recent = upto.slice(-THRESHOLDS.liquiditySessions).map((r) => num(r.turnover)).filter((v): v is number => v !== null).sort((a, b) => a - b);
  const medianCrore = recent.length ? recent[Math.floor((recent.length - 1) / 2)]! / 1e7 : null;

  // Horizons
  const horizons = Object.fromEntries(
    (Object.keys(HORIZONS) as HorizonKey[]).map((k) => [k, { stock: horizonStats(line, HORIZONS[k]), nifty: horizonStats(niftyLine, HORIZONS[k]) }]),
  ) as Record<HorizonKey, HorizonPair>;

  // Right now: RiskMetrics σ against its own last year (decision 0014)
  const sigmas = ewmaVolatility(line);
  const sigma = sigmas.at(-1) ?? null;
  const yearOfMoves = moves.filter((m) => m.changePct !== null).length >= VOL_WINDOW;
  const nowRatio = yearOfMoves && sigma !== null && dailyVol ? sigma / dailyVol : null;
  const rightNow = {
    light: nowRatio === null ? null : nowVolLight(nowRatio),
    sigma, weekPct: sigma === null ? null : sigma * Math.sqrt(WEEK), ratio: nowRatio,
    hit: rangeHitRate(line, sigmas),
  };

  // Bad days: capture and beta against the NIFTY 50, matched by date
  const capture = marketCapture(moves, niftyMoves);
  const badDays = { light: capture ? downCaptureLight(capture.down) : null, capture };

  // In crashes: breadth up to this session only, so a crash under way isn't counted
  const breadth = (await breadthSeries("sma200", indexName)).filter((b) => b.date <= date);
  const crash = crashEpisodes(breadth, line, niftyLine);
  const crashes = {
    light: crash.ratio !== null && crash.episodes.length >= THRESHOLDS.crashMinEpisodes ? ratioLight(crash.ratio) : null,
    ...crash,
  };

  // Price in the shown session's rupees: adjusted level scaled so the last point equals today's close
  const last = line.at(-1)!.level;
  const price = upto.map((r, i) => {
    const adj = (close * line[i]!.level) / last;
    const s200 = num(r.sma_200);
    return { date: r.d, close: adj, sma200: s200 === null ? null : (s200 * adj) / Number(r.close) };
  });

  // Events across the lineage
  const renames = (await db.execute<{ old_symbol: string; new_symbol: string; changed_on: string }>(sql`
    select old_symbol, new_symbol, changed_on::text from symbol_changes`))
    .map((r) => ({ oldSymbol: r.old_symbol, newSymbol: r.new_symbol, changedOn: r.changed_on }));
  const lineage = symbolLineage(symbol, renames);
  const syms = lineage.map((l) => l.symbol);
  const actions = await db.execute<{ d: string; kind: string; subject: string }>(sql`
    select ex_date::text d, kind, subject from corporate_actions
    where symbol in (${sql.join(syms.map((x) => sql`${x}`), sql`, `)}) and ex_date <= ${date} order by ex_date desc`);
  const events = [
    ...actions.filter((a) => SHARE_COUNT_KINDS.includes(a.kind)).map((a) => ({ date: a.d, kind: a.kind, text: a.subject })),
    ...lineage.slice(0, -1).map((l, i) => ({ date: l.from!, kind: "rename", text: `Renamed from ${lineage[i + 1]!.symbol} to ${l.symbol}` }))
      .filter((e) => e.date && e.date <= date),
  ]
    // only what happened within the history this card covers
    .filter((e) => e.date >= firstDate!)
    .sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
  const yearAgo = new Date(`${date}T00:00:00Z`); yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
  const dividends12m = actions.filter((a) => /dividend/i.test(a.subject) && a.d > yearAgo.toISOString().slice(0, 10)).length;

  return {
    kind: "ok",
    report: {
      symbol, date, requested: dateIso ?? null, snapped: Boolean(dateIso && dateIso !== date), prev, next,
      firstDate: firstDate!, lastDate: all.at(-1)!.d, membership, close,
      trend: { light: trendLight(close, sma50, sma200), sma50, sma200, side200, sessions200 },
      strength: {
        light: percentile === null ? null : strengthLight(percentile), percentile, peers: rank?.of ?? 0,
        ret3m: periodReturn(line, 63), ret6m, ret12m: periodReturn(line, 250), nifty6m,
      },
      bumpiness: { light: volRatio === null ? null : ratioLight(volRatio), dailyVol, niftyVol, ratio: volRatio },
      worstFall: { light: ddRatio === null ? null : ratioLight(ddRatio), stock: ddStock, nifty: ddNifty, ratio: ddRatio, currentPct: currentDrawdownPct(line) },
      liquidity: { light: medianCrore === null ? null : liquidityLight(medianCrore), medianCrore },
      rightNow, badDays, crashes,
      horizons, price, drawdown: drawdownSeries(line), events, dividends12m,
    },
  };
}
