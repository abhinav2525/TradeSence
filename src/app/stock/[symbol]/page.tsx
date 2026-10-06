import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import DateNav from "@/components/DateNav";
import StockChecks, { LightSummary, cardExtra, checksOf, membershipLine, peersLine } from "@/components/StockChecks";
import Hotkeys from "@/components/Hotkeys";
import RiskCalculator from "@/components/RiskCalculator";
import UnusualDaysCard from "@/components/UnusualDaysCard";
import { chartDrawdown, chartPrice } from "@/lib/chart-data";
import { recentUnusual } from "@/query/activity";
import CrashTable from "@/components/CrashTable";
import StockPriceChart from "@/components/StockPriceChart";
import DrawdownChart from "@/components/DrawdownChart";
import StockEvents from "@/components/StockEvents";
import { Card, CardFooter } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { stockReport, type StockReport } from "@/query/stock-report";
import type { HorizonKey } from "@/indicators/risk";
import IndexTabs from "@/components/IndexTabs";
import { cleanIndex } from "@/ingest/indices";

export const dynamic = "force-dynamic";

function cleanDate(v: string | undefined) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}
function isHorizon(v: string | undefined): v is HorizonKey {
  return v === "1w" || v === "1m" || v === "3m" || v === "1y";
}
/** Decode at most once, safely; anything that isn't a plausible NSE symbol 404s before any query. */
function cleanSymbol(raw: string): string | null {
  let s = raw;
  try {
    if (s.includes("%")) s = decodeURIComponent(s);
  } catch {
    return null;
  }
  s = s.toUpperCase();
  return /^[A-Z0-9&-]{1,20}$/.test(s) ? s : null;
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ date?: string; h?: string; u?: string }>;
}) {
  const symbol = cleanSymbol((await params).symbol);
  if (!symbol) notFound();
  const sp = await searchParams;
  const h: HorizonKey = isHorizon(sp.h) ? sp.h : "1m";
  const wanted = cleanDate(sp.date);

  // `u` picks the peer index; stockReport accepts only an index this stock was in, else its default
  const res = await stockReport(symbol, wanted, typeof sp.u === "string" ? sp.u : undefined);
  if (res.kind === "unknown") notFound();
  const base = `/stock/${encodeURIComponent(symbol)}`;

  if (res.kind === "no-data") {
    return (
      <AppShell current="stock" ma="sma200">
        <PageHeader eyebrow="Stock" title={symbol} />
        <Card className="px-6 py-12 text-center">
          <p className="text-heading text-foreground">Nothing loaded for that session</p>
          <p className="mt-2 text-body-sm text-foreground-2">
            {symbol}&apos;s history starts on {formatDate(res.firstDate)}.
          </p>
        </Card>
      </AppShell>
    );
  }

  const r = res.report;
  const unusual = await recentUnusual(symbol, r.date);
  const checks = checksOf(r);
  // `u` only when the peers aren't this date's default, so existing card URLs stay as they were
  const extra = cardExtra(r, h);
  const peers = peersLine(r);
  return (
    <AppShell current="stock" ma="sma200" asOf={r.lastDate}>
      {/* arrows step this stock's sessions and keep the horizon; 1-3 do nothing here */}
      <Hotkeys ma="sma200" page="stock" base={base} extra={extra} prev={r.prev} next={r.next} />
      <PageHeader
        eyebrow={`${r.peerIndex.label} · Stock`}
        title={symbol}
        description={`${membershipLine(r)} Read on ${formatDate(r.date)}, with history since ${formatDate(r.firstDate)}.${peers ? ` ${peers}` : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {r.indices.length > 1 && (
              <IndexTabs
                base={base as `/stock/${string}`}
                current={cleanIndex(r.peerIndex.key)}
                only={r.indices}
                defaultKey={r.defaultKey}
                label="Rank among the members of"
                ma="sma200"
                date={r.requested ? r.date : undefined}
                extra={`&h=${h}`}
              />
            )}
          <DateNav
            base={base}
            extra={extra}
            ma="sma200"
            date={r.date}
            requested={r.requested}
            snapped={r.snapped}
            prev={r.prev}
            next={r.next}
            min={r.firstDate}
            max={r.lastDate}
          />
          </div>
        }
      />
      <div className="flex flex-col gap-cards">
        <LightSummary checks={checks} />
        <StockChecks checks={checks} />
        <RiskCalculator symbol={symbol} horizons={r.horizons} initial={h} firstDate={r.firstDate} />
        <CrashTable crashes={r.crashes} />
        <Card>
          <StockPriceChart data={chartPrice(r.price)} selectedDate={r.requested ? r.date : null} />
          <CardFooter>Adjusted for splits, bonuses and demergers, in the rupees of {formatDate(r.date)}.</CardFooter>
        </Card>
        <div className="grid gap-cards xl:grid-cols-12">
          <Card className="xl:col-span-8">
            <DrawdownChart
              data={chartDrawdown(r.drawdown)}
              trough={r.worstFall.stock ? { date: r.worstFall.stock.troughDate, pct: r.worstFall.stock.depthPct } : null}
            />
          </Card>
          <StockEvents className="xl:col-span-4" events={r.events} dividends12m={r.dividends12m} date={r.date} />
        </div>
        <UnusualDaysCard rows={unusual} />
      </div>
    </AppShell>
  );
}
