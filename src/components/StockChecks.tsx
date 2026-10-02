import LightDot from "@/components/LightDot";
import { Card } from "@/components/ui/card";
import { formatDate, formatInt, ordinal, signed } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Light } from "@/indicators/risk";
import type { StockReport } from "@/query/stock-report";

const pct = (v: number, digits = 1) => `${signed(v, digits)}%`;
const abs0 = (v: number) => Math.abs(v).toFixed(0);

type Check = { label: string; light: Light | null; figure: string; sentence: string };

/** The five checks, each one figure, one light and one plain sentence from the report's numbers. */
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
      : `6-month return ${pct(s.ret6m)} vs the NIFTY 50's ${pct(s.nifty6m)}: stronger than ${s.percentile.toFixed(0)}% of the members on this day.`;

  const b = r.bumpiness;
  const bumpSentence =
    b.dailyVol === null || b.niftyVol === null || b.ratio === null
      ? "Not enough history to measure daily moves yet."
      : `A typical day moves about ±${b.dailyVol.toFixed(1)}%, ${b.ratio.toFixed(1)}× the NIFTY 50's ±${b.niftyVol.toFixed(1)}%.`;

  const w = r.worstFall;
  const ws = w.stock;
  const fallSentence = !ws || ws.depthPct === 0
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

  return [
    { label: "Trend", light: t.light, figure: t.sma200 === null ? "—" : pct((r.close / t.sma200 - 1) * 100), sentence: trendSentence },
    { label: "Strength", light: s.light, figure: s.percentile === null ? "—" : ordinal(s.percentile), sentence: strengthSentence },
    { label: "Bumpiness", light: b.light, figure: b.ratio === null ? "—" : `${b.ratio.toFixed(1)}×`, sentence: bumpSentence },
    { label: "Worst fall", light: w.light, figure: ws ? `${signed(ws.depthPct, 0)}%` : "—", sentence: fallSentence },
    { label: "Liquidity", light: l.light, figure: crore === null ? "—" : `₹${formatInt(crore)} cr`, sentence: liqSentence },
  ];
}

/** Counts of each light, never a score. */
export function LightSummary({ checks, className }: { checks: Check[]; className?: string }) {
  const n = (x: Light) => checks.filter((c) => c.light === x).length;
  return (
    <Card className={cn("flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4", className)}>
      {checks.map((c) => (
        <span key={c.label} className="inline-flex items-center gap-2 text-[13px] text-foreground-2">
          {c.label}
          <LightDot light={c.light} />
        </span>
      ))}
      <span className="ml-auto text-[12px] tabular-nums text-muted-foreground">
        {n("green")} green · {n("amber")} amber · {n("red")} red
      </span>
    </Card>
  );
}

export default function StockChecks({ checks, className }: { checks: Check[]; className?: string }) {
  return (
    <div className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-5", className)}>
      {checks.map((c) => (
        <Card key={c.label} className="flex flex-col p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-medium text-muted-foreground">{c.label}</p>
            <LightDot light={c.light} />
          </div>
          <p className="mt-3 text-metric tabular-nums text-foreground">{c.figure}</p>
          <p className="mt-auto pt-2.5 text-[12px] leading-4 text-foreground-2">{c.sentence}</p>
        </Card>
      ))}
    </div>
  );
}
