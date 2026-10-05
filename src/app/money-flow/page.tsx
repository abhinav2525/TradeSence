import Link from "next/link";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import Hotkeys from "@/components/Hotkeys";
import SlidingPill from "@/components/SlidingPill";
import Term from "@/components/Term";
import FlowBars from "@/components/FlowBars";
import FlowStocks from "@/components/FlowStocks";
import FlowHistoryChart from "@/components/FlowHistoryChart";
import { Badge } from "@/components/ui/badge";
import { Card, CardFooter } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MaKind } from "@/query/breadth";
import { cleanFlowPeriod, cleanSector, sectorFlows, sectorStocks, type FlowPeriod } from "@/indicators/money-flow";
import { moneyFlowRows, sectorHistory, shortSessionsIn, withReportCard } from "@/query/money-flow";

export const dynamic = "force-dynamic";

// Every search param is checked with strict comparisons and falls back to its
// default (CLAUDE.md); `sector` must match a sector in tonight's rows, so nothing
// else from the URL reaches SQL.
function isMaKind(v: string | undefined): v is MaKind {
  return v === "sma200" || v === "ema200" || v === "sma50";
}
const PERIOD_LABEL: Record<FlowPeriod, string> = { 1: "1 day", 5: "1 week", 21: "1 month" };
const PERIOD_PHRASE: Record<FlowPeriod, string> = { 1: "on the day", 5: "over the week", 21: "over the month" };
const seg = (on: boolean) =>
  cn(
    "inline-flex h-8 items-center gap-2 rounded-[8px] px-3 text-body-sm font-medium transition-colors",
    on ? "bg-thumb text-foreground shadow-thumb" : "text-muted-foreground hover:text-foreground",
  );
const colHead = "text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ma?: string; period?: string; sector?: string }>;
}) {
  const sp = await searchParams;
  const ma: MaKind = isMaKind(sp.ma) ? sp.ma : "sma200";
  const period = cleanFlowPeriod(sp.period);
  const { asOf, rows } = await moneyFlowRows(period);
  const { sectors, small } = sectorFlows(rows, period);
  const sector = cleanSector(sp.sector, sectors.map((s) => s.sector));
  const short = asOf ? await shortSessionsIn(period) : [];
  const stocks = sector ? sectorStocks(rows, sector, period) : [];
  const withCard = await withReportCard(stocks.map((s) => s.symbol));
  const picked = sectors.find((s) => s.sector === sector);
  const history = sector ? await sectorHistory(sector) : [];

  const href = (p: { period?: FlowPeriod; sector?: string | null }) => {
    const q = new URLSearchParams({ ma, period: String(p.period ?? period) });
    const sec = p.sector === undefined ? sector : p.sector;
    if (sec) q.set("sector", sec);
    return `/money-flow?${q.toString()}${sec ? "#stocks" : ""}`;
  };
  const busier = sectors.filter((s) => s.ratio !== null && s.ratio > 1).length;

  return (
    <AppShell current="money-flow" ma={ma} asOf={asOf}>
      <Hotkeys ma={ma} page="money-flow" />
      <PageHeader
        eyebrow="Nifty Total Market · Sectors"
        title="Money flow"
        description="Which sectors are trading far more, or far less, money than their own normal, and which way their stocks moved. Facts about where trading went, not predictions."
      />

      {!asOf || sectors.length === 0 ? (
        <Card className="px-6 py-12 text-center">
          <p className="text-heading text-foreground">Nothing loaded yet</p>
          <p className="mt-2 text-body-sm text-foreground-2">
            Run <code className="rounded-sm bg-raised px-1.5 py-0.5 font-mono text-[12px]">bun run money-flow</code> (it also runs every night).
          </p>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-card-x py-3">
              <div className="seg relative inline-flex items-center gap-0.5 rounded-md border bg-raised p-0.5" role="tablist" aria-label="Period">
                <SlidingPill active={String(period)} />
                {([1, 5, 21] as const).map((p) => (
                  <Link key={p} href={href({ period: p })} role="tab" aria-selected={period === p} className={seg(period === p)}>
                    {PERIOD_LABEL[p]}
                  </Link>
                ))}
              </div>
              <Badge variant="neutral">{busier} of {sectors.length} sectors busier than usual</Badge>
            </div>

            <div className="px-card-x pb-2 pt-4">
              <h2 className="text-heading text-foreground">
                <Term id="trading-vs-normal">Trading vs normal</Term> {PERIOD_PHRASE[period]} to {formatDate(asOf)}
              </h2>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Each <Term id="nse-sector">sector</Term> against its own last 3 months; the line is 1× (a usual amount). Bar length: trading. Colour: price move (green: its stocks mostly rose; red: mostly fell). Heavy trading can be selling as much as buying. Pick a sector to see the stocks driving it.
              </p>
              {short.length > 0 && (
                <p className="mt-2 rounded-md border bg-raised px-3 py-2 text-[12px] text-foreground-2">
                  {short.map(formatDate).join(", ")} {short.length === 1 ? "was a short special session" : "were short special sessions"} (such as Diwali Muhurat), when the whole market trades a fraction of a normal day. Every sector looks quieter {period === 1 ? "today" : "this period"} because of {short.length === 1 ? "it" : "them"}.
                </p>
              )}
            </div>
            <div className={cn("hidden gap-x-4 border-b px-card-x pb-2 sm:grid sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_4rem_7.5rem_5rem]", colHead)}>
              <span>Sector</span>
              <span />
              <span className="text-right">vs normal</span>
              <span className="text-right"><Term id="share-of-trading">Share of all trading</Term> (usual)</span>
              <span className="text-right">Typical stock&apos;s price move</span>
            </div>
            <FlowBars sectors={sectors} selected={sector} hrefFor={(s) => href({ sector: s === sector ? null : s })} />
            <CardFooter>
              About 750 Nifty Total Market stocks, with NSE&apos;s sectors.
              {small.length > 0 && ` Left out (fewer than 5 stocks): ${small.join(", ")}.`}
              {" "}New listings without 3 months of history count in the share, not in &ldquo;vs normal&rdquo;.
            </CardFooter>
          </Card>

          {picked && (
            <Card id="stocks" className="overflow-hidden">
              <div className="flex items-start justify-between gap-3 px-card-x pb-2 pt-4">
                <div>
                  <h2 className="text-heading text-foreground">How trading in {picked.sector} has moved</h2>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    Each week&apos;s <Term id="trading-vs-normal">trading vs normal</Term> over the past year; the dashed line is 1×. Rings mark weeks with a short special session.
                  </p>
                </div>
                <Link href={href({ sector: null })} className="shrink-0 text-body-sm font-medium text-brand hover:underline">Close</Link>
              </div>
              <div className="px-card-x pb-3">
                {history.some((h) => h.ratio !== null)
                  ? <FlowHistoryChart data={history} />
                  : <p className="py-6 text-body-sm text-muted-foreground">No history yet for this sector.</p>}
              </div>
              <CardFooter>Uses today&apos;s Nifty Total Market stocks and sectors for the whole year; each sector is compared with its own past on the same stocks.</CardFooter>
            </Card>
          )}

          {picked && (
            <Card className="overflow-hidden">
              <div className="flex items-start justify-between gap-3 px-card-x pb-2 pt-4">
                <div>
                  <h2 className="text-heading text-foreground">{picked.sector}: most extra trading</h2>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    Stocks by extra rupees traded above their own normal, {PERIOD_PHRASE[period]}. {picked.up} rose, {picked.down} fell.
                  </p>
                </div>
              </div>
              <FlowStocks rows={stocks} withCard={withCard} periodLabel={PERIOD_LABEL[period]} />
              <CardFooter>Top {stocks.length} of {picked.stocks} stocks. Report Cards cover stocks that have been in the NIFTY 50 since 2020.</CardFooter>
            </Card>
          )}
        </>
      )}
    </AppShell>
  );
}
