/**
 * One live sentence per glossary term, from the same queries the pages use, so
 * a Learn page's "Today in tradeSence" can't disagree with the page itself.
 * Returns null (never throws) when there's nothing to show yet.
 */
import { breadthSeries, resolveSession } from "./breadth";
import { advanceDeclineSeries } from "./advance-decline";
import { screenerOn } from "./screener";
import { crossingStats } from "./crossings";
import { stockReport } from "./stock-report";
import { membersOn, readMembershipHistory } from "../ingest/nifty50-history";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { formatDate, formatInt, formatPrice, ordinal, signed } from "../lib/format";
import type { TermId } from "../lib/glossary";

const SHOWCASE = "KOTAKBANK";
/** Under this many sessions, "fewest crossings" would just mean "newest stock". */
const WHIPSAW_MIN_SESSIONS = 250;
const pct = (v: number, d = 1) => `${signed(v, d)}%`;

async function build(id: TermId): Promise<string | null> {
  switch (id) {
    case "membership": {
      const rows = readMembershipHistory();
      const today = new Date().toISOString().slice(0, 10);
      const last = rows.flatMap((r) => [r.addedOn, r.removedOn ?? ""]).filter((d) => d && d <= today).sort().at(-1);
      return last ? `${membersOn(rows, today).length} members today; the latest change was on ${formatDate(last)}.` : null;
    }
    case "session": {
      const d = await resolveSession("sma200");
      return d ? `The latest session loaded is ${formatDate(d)}.` : null;
    }
    case "nifty50": {
      const [row] = await db.execute<{ d: string; close: number }>(sql`
        select trade_date::text d, close from index_prices where index_name = 'Nifty 50'
        order by trade_date desc limit 1`);
      return row ? `The NIFTY 50 closed at ${formatPrice(Number(row.close))} on ${formatDate(row.d)}.` : null;
    }
    case "breadth": case "percentile": case "five-session-change": {
      const s = await breadthSeries("sma200");
      const p = s.at(-1);
      if (!p) return null;
      if (id === "breadth") return `On ${formatDate(p.date)}, ${p.above} of ${p.total} NIFTY 50 stocks (${p.pctAbove.toFixed(0)}%) closed above their 200-day SMA.`;
      if (id === "percentile") {
        const pc = (s.filter((x) => x.pctAbove <= p.pctAbove).length / s.length) * 100;
        return `On ${formatDate(p.date)}, 200-day breadth of ${p.pctAbove.toFixed(0)}% was at the ${ordinal(pc)} percentile of ${formatInt(s.length)} sessions.`;
      }
      const prior = s.at(-6);
      return prior ? `200-day breadth moved ${signed(p.pctAbove - prior.pctAbove)} pts in the five sessions to ${formatDate(p.date)}.` : null;
    }
    case "advancers-decliners": case "net-advances": case "rana": case "mcclellan": case "summation-index":
    case "ad-line": case "advancing-share-10d": case "breadth-thrust": {
      const p = (await advanceDeclineSeries()).at(-1);
      if (!p) return null;
      const on = `On ${formatDate(p.date)}`;
      switch (id) {
        case "advancers-decliners": return `${on}: ${p.advancing} advancers, ${p.declining} decliners, ${p.unchanged} unchanged.`;
        case "net-advances": return `${on}: ${signed(p.net)} (${p.advancing} rose, ${p.declining} fell).`;
        case "rana": return `${on}: RANA was ${signed(p.rana)}.`;
        case "mcclellan": return p.mcclellan === null ? null : `${on}: the McClellan oscillator was ${signed(p.mcclellan, 1)}, ${p.mcclellan >= 0 ? "above" : "below"} zero.`;
        case "summation-index": return p.summation === null ? null : `${on}: the summation index was ${signed(p.summation)}.`;
        case "ad-line": return `${on}: net advances were ${signed(p.net)}; the A/D line adds these up across the range you choose.`;
        default: return p.adv10 === null ? null : `${on}: the 10-day advancing share was ${p.adv10.toFixed(1)}%${p.adv10 < 40 ? ", under 40%: a thrust would need it above 61.5% within 10 sessions" : ""}.`;
      }
    }
    case "crossing": case "volume-ratio": case "near-the-line": {
      const d = await resolveSession("sma200");
      if (!d) return null;
      const { rows } = await screenerOn("sma200", d);
      if (rows.length === 0) return null;
      if (id === "crossing") {
        const up = rows.filter((r) => r.cross === "above").length;
        const down = rows.filter((r) => r.cross === "below").length;
        return `On ${formatDate(d)}, ${up} stocks crossed above their 200-day SMA and ${down} crossed below.`;
      }
      if (id === "near-the-line") {
        const n = rows.filter((r) => r.pctFromMa !== null && Math.abs(r.pctFromMa) <= 1).length;
        return `On ${formatDate(d)}, ${n} stocks closed within 1% of their 200-day SMA.`;
      }
      const top = rows.filter((r) => r.volRatio !== null).sort((a, b) => b.volRatio! - a.volRatio!)[0];
      return top ? `On ${formatDate(d)}, ${top.symbol} traded the heaviest volume against its normal: ${top.volRatio!.toFixed(1)}×.` : null;
    }
    case "whipsaw": {
      const s = (await crossingStats("sma200")).filter((c) => c.sessions >= WHIPSAW_MIN_SESSIONS);
      if (s.length === 0) return null;
      const sorted = [...s].sort((a, b) => a.crossings - b.crossings);
      return `Since 2020, ${sorted[0]!.symbol} crossed its 200-day SMA the fewest times (${sorted[0]!.crossings}) and ${sorted.at(-1)!.symbol} the most (${sorted.at(-1)!.crossings}).`;
    }
    case "sma": case "ema": case "ma-50-200": case "trend-check": case "relative-strength":
    case "volatility": case "drawdown": case "liquidity": case "stretches": case "adjusted-prices": {
      const res = await stockReport(SHOWCASE);
      if (res.kind !== "ok") return null;
      const r = res.report;
      const on = formatDate(r.date);
      switch (id) {
        case "sma": return r.trend.sma200 === null ? null : `${SHOWCASE} closed at ₹${formatPrice(r.close)} on ${on}; its 200-day SMA was ₹${formatPrice(r.trend.sma200)}.`;
        case "ema": return null; // the report doesn't carry the EMA; the page shows it on Breadth
        case "ma-50-200": case "trend-check":
          return r.trend.sma50 === null || r.trend.sma200 === null ? null
            : `${SHOWCASE} on ${on}: close ₹${formatPrice(r.close)}, 50-day ₹${formatPrice(r.trend.sma50)}, 200-day ₹${formatPrice(r.trend.sma200)}.`;
        case "relative-strength": return r.strength.percentile === null || r.strength.ret6m === null ? null
          : `${SHOWCASE}'s 6-month return to ${on} was ${pct(r.strength.ret6m)}, stronger than ${r.strength.percentile.toFixed(0)}% of the members.`;
        case "volatility": return r.bumpiness.ratio === null || r.bumpiness.dailyVol === null ? null
          : `${SHOWCASE} moves about ±${r.bumpiness.dailyVol.toFixed(1)}% on a typical day: ${r.bumpiness.ratio.toFixed(1)}× the NIFTY 50.`;
        case "drawdown": return !r.worstFall.stock || r.worstFall.stock.depthPct === 0 ? null
          : `${SHOWCASE}'s worst fall since ${formatDate(r.firstDate)} was ${signed(r.worstFall.stock.depthPct, 0)}% (${formatDate(r.worstFall.stock.peakDate)} to ${formatDate(r.worstFall.stock.troughDate)}).`;
        case "liquidity": return r.liquidity.medianCrore === null ? null
          : `About ₹${formatInt(Math.round(r.liquidity.medianCrore))} crore of ${SHOWCASE} changes hands on a typical day.`;
        case "stretches": { const m = r.horizons["1m"].stock; return m ? `${SHOWCASE} has ${formatInt(m.windows)} month-long stretches since ${formatDate(r.firstDate)}; 1 in 10 lost more than ${Math.abs(m.p10).toFixed(1)}%.` : null; }
        default: { const e = r.events.find((x) => x.kind !== "rename"); return e ? `${SHOWCASE}: ${e.text.replace(/\s+/g, " ")} (${formatDate(e.date)}).` : null; }
      }
    }
  }
}

export async function liveExample(id: TermId): Promise<string | null> {
  try {
    return await build(id);
  } catch {
    return null;
  }
}
