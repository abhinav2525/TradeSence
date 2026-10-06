import LightDot from "@/components/LightDot";
import { Card } from "@/components/ui/card";
import { formatDate, formatInt, ordinal, signed } from "@/lib/format";
import { cn } from "@/lib/utils";
import { THRESHOLDS, type Light } from "@/indicators/risk";
import type { StockReport } from "@/query/stock-report";
import { LIGHTS_DISCLAIMER } from "@/lib/report-card";
import Term from "@/components/Term";
import type { TermId } from "@/lib/glossary";
import CountUp from "@/components/CountUp";
import { NIFTY50 } from "@/ingest/indices";

const pct = (v: number, digits = 1) => `${signed(v, digits)}%`;
const abs0 = (v: number) => Math.abs(v).toFixed(0);

type Check = { label: string; term: TermId; light: Light | null; figure: string; sentence: string };

/** The eight checks, each one figure, one light and one plain sentence from the report's numbers. */
export function checksOf(r: StockReport): Check[] {
  const t = r.trend;
  const trendSentence =
    t.sma50 === null || t.sma200 === null
      ? "Not enough history for both averages yet."
      : r.close > t.sma50 && r.close > t.sma200
        ? `Above its 50- and 200-day averages; above the 200-day for ${t.sessions200} sessions.`
        : r.close > t.sma200
          ? "Above its 200-day average but below its 50-day."
          : r.close > t.sma50
            ? "Above its 50-day average but below its 200-day."
            : `Below both its 50- and 200-day averages, for ${t.sessions200} sessions under the 200-day.`;

  const s = r.strength;
  const strengthSentence =
    s.percentile === null || s.ret6m === null || s.nifty6m === null
      ? "Not enough history for a 6-month comparison yet."
      : r.peerIndex.key === NIFTY50.key
        ? `6-month return ${pct(s.ret6m)} vs the NIFTY 50's ${pct(s.nifty6m)}: stronger than ${s.percentile.toFixed(0)}% of the other ${s.peers} members on this day.`
        : // a small index: the count, not a percentage (decision 0035)
          `6-month return ${pct(s.ret6m)} vs the NIFTY 50's ${pct(s.nifty6m)}: stronger than ${s.below} of the ${s.peers} other ${r.peerIndex.label} member${s.peers === 1 ? "" : "s"} on this day.`;

  const b = r.bumpiness;
  const bumpSentence =
    b.dailyVol === null || b.niftyVol === null || b.ratio === null
      ? "Not enough history to measure daily moves yet."
      : `A typical day moves about ±${b.dailyVol.toFixed(1)}%, ${b.ratio.toFixed(1)}× the NIFTY 50's ±${b.niftyVol.toFixed(1)}%.`;

  const w = r.worstFall;
  const ws = w.stock;
  const fallSentence = !ws
    ? "Not enough history yet: a worst fall needs at least a year of sessions."
    : ws.depthPct === 0
    ? "No fall from a high in this history."
    : ws.recoveryDate
      ? `Fell ${abs0(ws.depthPct)}% from ${formatDate(ws.peakDate)} to ${formatDate(ws.troughDate)}; took ${Math.max(1, Math.round(ws.sessionsToRecover! / 21))} months to get back.${w.nifty ? ` The NIFTY 50's worst over the same years was ${abs0(w.nifty.depthPct)}%.` : ""}`
      : `Fell ${abs0(ws.depthPct)}% from its ${formatDate(ws.peakDate)} high and hasn't recovered: still ${abs0(w.currentPct ?? ws.depthPct)}% below it.${w.nifty ? ` The NIFTY 50's worst over the same years was ${abs0(w.nifty.depthPct)}%.` : ""}`;

  const l = r.liquidity;
  const crore = l.medianCrore === null ? null : Math.round(l.medianCrore);
  const liqSentence =
    crore === null
      ? "No turnover recorded yet."
      : `About ₹${formatInt(crore)} crore changes hands on a typical day: ${
          l.light === "green" ? "easy to buy and sell." : l.light === "amber" ? "thinner trading, so large orders can move the price." : "thin trading, so getting in and out can be costly."
        }`;

  const n = r.rightNow;
  const rupees = (pctMove: number) => `₹${formatInt(Math.round(pctMove * 100))}`; // on ₹10,000
  const nowSentence =
    n.weekPct === null || n.ratio === null
      ? "Not enough history yet: this needs a year of daily moves."
      : `A normal week: up or down about ${n.weekPct.toFixed(1)}% (about ${rupees(n.weekPct)} on ₹10,000). ${n.ratio <= 1 ? "Calmer" : "Jumpier"} than its usual year.${
          n.hit ? ` In the last 2 years, ${Math.round((n.hit.inside / n.hit.of) * 10)} in 10 weeks stayed inside the range this method gave at the time (of ${formatInt(n.hit.of)} overlapping weeks).` : ""
        }`;

  const c = r.badDays.capture;
  const badSentence = !c
    ? "Not enough sessions alongside the NIFTY 50 yet."
    : `When the NIFTY falls 1%, it usually falls ${(c.down / 100).toFixed(1)}%. When it rises 1%, this rises ${(c.up / 100).toFixed(1)}%. Beta ${c.beta.toFixed(2)}.`;

  const k = r.crashes;
  const ongoingNote = k.ongoing ? ` A new episode began on ${formatDate(k.ongoing)}; it counts once 3 months have passed.` : "";
  const crashSentence =
    k.episodes.length < THRESHOLDS.crashMinEpisodes || k.medianStock === null || k.medianNifty === null
      ? `${k.episodes.length === 0 ? "No completed market crash in its history yet" : `Only ${k.episodes.length} completed market ${k.episodes.length === 1 ? "crash" : "crashes"} in its history`}: not enough to judge.${ongoingNote}`
      : `In ${k.episodes.length} crashes since ${k.episodes[0]!.start.slice(0, 4)} it fell a median ${abs0(k.medianStock)}% from its high before each one (NIFTY ${abs0(k.medianNifty)}%)${
          k.backOf ? ` and was above its start-of-crash price 6 months later in ${k.backCount} of ${k.backOf}` : ""
        }.${ongoingNote}`;

  return [
    { label: "Trend", term: "trend-check", light: t.light, figure: t.sma200 === null ? "—" : pct((r.close / t.sma200 - 1) * 100), sentence: trendSentence },
    { label: "Strength", term: "relative-strength", light: s.light, figure: s.percentile === null ? "—" : r.peerIndex.key === NIFTY50.key ? ordinal(s.percentile) : `${s.below} of ${s.peers}`, sentence: strengthSentence },
    { label: "Bumpiness", term: "volatility", light: b.light, figure: b.ratio === null ? "—" : `${b.ratio.toFixed(1)}×`, sentence: bumpSentence },
    { label: "Worst fall", term: "drawdown", light: w.light, figure: ws ? `${signed(ws.depthPct, 0)}%` : "—", sentence: fallSentence },
    { label: "Liquidity", term: "liquidity", light: l.light, figure: crore === null ? "—" : `₹${formatInt(crore)} cr`, sentence: liqSentence },
    { label: "Right now", term: "right-now", light: n.light, figure: n.ratio === null ? "—" : `${n.ratio.toFixed(1)}×`, sentence: nowSentence },
    { label: "Bad days", term: "bad-days", light: r.badDays.light, figure: c ? `${c.down.toFixed(0)}%` : "—", sentence: badSentence },
    { label: "In crashes", term: "crash-episodes", light: k.light, figure: k.light === null || k.ratio === null ? "—" : `${k.ratio.toFixed(1)}×`, sentence: crashSentence },
  ];
}

/** The card's first sentence: when the stock joined or left the index its peers come from. */
export function membershipLine(r: StockReport): string {
  const last = r.membership.at(-1)!;
  const ix = r.peerIndex.key === NIFTY50.key ? "the NIFTY 50" : r.peerIndex.label;
  if (last.removedOn === null) {
    return last.addedOn === "2020-01-01"
      ? `In ${ix} since at least Jan 2020 (when the membership record starts).`
      : `In ${ix} since ${formatDate(last.addedOn)}.`;
  }
  return `Left ${ix} on ${formatDate(last.removedOn)}${last.addedOn === "2020-01-01" ? "" : ` (joined ${formatDate(last.addedOn)})`}.`;
}

/**
 * The params the card's arrows and date picker keep: the horizon, and `u` only when the
 * peers aren't the shown date's default, so existing card URLs stay as they were.
 */
export function cardExtra(r: StockReport, h: string): string {
  return `&h=${h}${r.peerIndex.key === r.defaultKey ? "" : `&u=${r.peerIndex.key}`}`;
}

/** Said plainly whenever the peers aren't the NIFTY 50's (owner, 2026-10-05; decision 0035). */
export function peersLine(r: StockReport): string | null {
  if (r.peerIndex.key === NIFTY50.key) return null;
  return `Strength ranks it among ${r.peerIndex.label}'s members on that day. Every other check compares it with the NIFTY 50, the market.`;
}

/** Counts of each light, never a score. */
export function LightSummary({ checks, className }: { checks: Check[]; className?: string }) {
  const n = (x: Light) => checks.filter((c) => c.light === x).length;
  return (
    <Card className={cn("flex flex-wrap items-center gap-x-6 gap-y-3 px-card-x py-4", className)}>
      {checks.map((c) => (
        <span key={c.label} className="inline-flex items-center gap-2 text-body-sm text-foreground-2">
          {c.label}
          <LightDot light={c.light} />
        </span>
      ))}
      <span className="ml-auto text-[12px] tabular-nums text-muted-foreground">
        {n("green")} green · {n("amber")} amber · {n("red")} red
      </span>
      <p className="w-full text-[12px] text-muted-foreground">{LIGHTS_DISCLAIMER}</p>
    </Card>
  );
}

export default function StockChecks({ checks, className }: { checks: Check[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-4 lg:grid-cols-4", className)}>
      {checks.map((c) => (
        <Card key={c.label} className="flex flex-col p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-medium text-muted-foreground">
              <Term id={c.term} today={c.figure}>{c.label}</Term>
            </p>
            <LightDot light={c.light} />
          </div>
          <p className="mt-3 text-metric tabular-nums text-foreground"><CountUp text={c.figure} /></p>
          <p className="mt-auto pt-2.5 text-[12px] leading-4 text-foreground-2">{c.sentence}</p>
        </Card>
      ))}
    </div>
  );
}
