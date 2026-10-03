import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import DateNav from "@/components/DateNav";
import StockChecks, { LightSummary, checksOf } from "@/components/StockChecks";
import Hotkeys from "@/components/Hotkeys";
import RiskCalculator from "@/components/RiskCalculator";
import CrashTable from "@/components/CrashTable";
import StockPriceChart from "@/components/StockPriceChart";
import DrawdownChart from "@/components/DrawdownChart";
import StockEvents from "@/components/StockEvents";
import { Card, CardFooter } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { stockReport, type StockReport } from "@/query/stock-report";
import type { HorizonKey } from "@/indicators/risk";

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

function membershipLine(r: StockReport): string {
  const last = r.membership.at(-1)!;
  if (last.removedOn === null) {
    return last.addedOn === "2020-01-01"
      ? "In the NIFTY 50 since at least Jan 2020 (when the membership record starts)."
      : `In the NIFTY 50 since ${formatDate(last.addedOn)}.`;
  }
  return `Left the NIFTY 50 on ${formatDate(last.removedOn)}${last.addedOn === "2020-01-01" ? "" : ` (joined ${formatDate(last.addedOn)})`}.`;
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ date?: string; h?: string }>;
}) {
  const symbol = cleanSymbol((await params).symbol);
  if (!symbol) notFound();
  const sp = await searchParams;
  const h: HorizonKey = isHorizon(sp.h) ? sp.h : "1m";
  const wanted = cleanDate(sp.date);

  const res = await stockReport(symbol, wanted);
  if (res.kind === "unknown") notFound();
  const base = `/stock/${encodeURIComponent(symbol)}`;

  if (res.kind === "no-data") {
    return (
      <AppShell current="stock" ma="sma200">
        <PageHeader eyebrow="NIFTY 50 · Stock" title={symbol} />
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
  const checks = checksOf(r);
  return (
    <AppShell current="stock" ma="sma200" asOf={r.lastDate}>
      {/* arrows step this stock's sessions and keep the horizon; 1-3 do nothing here */}
      <Hotkeys ma="sma200" page="stock" base={base} extra={`&h=${h}`} prev={r.prev} next={r.next} />
      <PageHeader
        eyebrow="NIFTY 50 · Stock"
        title={symbol}
        description={`${membershipLine(r)} Read on ${formatDate(r.date)}, with history since ${formatDate(r.firstDate)}.`}
        actions={
          <DateNav
            base={base}
            extra={`&h=${h}`}
            ma="sma200"
            date={r.date}
            requested={r.requested}
            snapped={r.snapped}
            prev={r.prev}
            next={r.next}
            min={r.firstDate}
            max={r.lastDate}
          />
        }
      />
      <div className="flex flex-col gap-4">
        <LightSummary checks={checks} />
        <StockChecks checks={checks} />
        <RiskCalculator symbol={symbol} horizons={r.horizons} initial={h} firstDate={r.firstDate} />
        <CrashTable crashes={r.crashes} />
        <Card>
          <StockPriceChart data={r.price} selectedDate={r.requested ? r.date : null} />
          <CardFooter>Adjusted for splits, bonuses and demergers, in the rupees of {formatDate(r.date)}.</CardFooter>
        </Card>
        <div className="grid gap-4 xl:grid-cols-12">
          <Card className="xl:col-span-8">
            <DrawdownChart
              data={r.drawdown}
              trough={r.worstFall.stock ? { date: r.worstFall.stock.troughDate, pct: r.worstFall.stock.depthPct } : null}
            />
          </Card>
          <StockEvents className="xl:col-span-4" events={r.events} dividends12m={r.dividends12m} date={r.date} />
        </div>
      </div>
    </AppShell>
  );
}
