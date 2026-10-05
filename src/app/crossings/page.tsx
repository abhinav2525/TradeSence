import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import MaTabs from "@/components/MaTabs";
import Readout from "@/components/Readout";
import CrossingsTable from "@/components/CrossingsTable";
import CrossingsBars from "@/components/CrossingsBars";
import Hotkeys from "@/components/Hotkeys";
import IndexTabs from "@/components/IndexTabs";
import { NIFTY50, cleanIndex, uParam } from "@/ingest/indices";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatInt } from "@/lib/format";
import { crossingStats } from "@/query/crossings";
import { supportedStocks } from "@/query/stock-report";
import { MA_LABELS, resolveSession, type MaKind } from "@/query/breadth";

export const dynamic = "force-dynamic";

function isMaKind(v: string | undefined): v is MaKind {
  return v === "sma200" || v === "ema200" || v === "sma50";
}

export default async function CrossingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ma?: string; u?: string }>;
}) {
  const { ma: raw, u: rawU } = await searchParams;
  const ma: MaKind = isMaKind(raw) ? raw : "sma200";
  const label = MA_LABELS[ma];
  // Which index (decision 0034): checked against the registry, NIFTY 50 by default.
  const ix = cleanIndex(rawU);
  const isNifty = ix === NIFTY50;
  const keep = uParam(ix);
  const who = isNifty ? "constituents" : "members";

  const [rows, asOf, withCards] = await Promise.all([
    crossingStats(ma, ix.members), resolveSession(ma, undefined, ix.members), isNifty ? null : supportedStocks(),
  ]);
  // Report Cards exist for NIFTY 50 stocks only until step B; others show unlinked.
  const cards = withCards?.map((s) => s.symbol);

  const total = rows.reduce((n, r) => n + r.crossings, 0);
  const busiest = rows[0];
  const calmest = rows.at(-1);
  const median = rows.length
    ? [...rows].map((r) => r.crossings).sort((a, b) => a - b)[Math.floor(rows.length / 2)]!
    : 0;

  return (
    <AppShell current="crossings" ma={ma} asOf={asOf}>
      <Hotkeys ma={ma} page="crossings" extra={keep} />

      <PageHeader
        eyebrow={`${ix.label} · Whipsaw`}
        title="Crossings"
        description={isNifty
          ? "How often each stock has crossed its average since 2020. Whipsaw means flipping back and forth: a stock with many crossings has changed sides often; one with few has stayed on one side for long stretches."
          : `How often each bank that has been in ${ix.label} since 2020 crossed its average while it was a member. Whipsaw means flipping back and forth: many crossings means it changed sides often; few means long stretches on one side.`}
        actions={
          <>
            <IndexTabs base="/crossings" current={ix} ma={ma} />
            <MaTabs base="/crossings" ma={ma} extra={keep} />
          </>
        }
      />

      {busiest && (
        <Readout
          className="mb-cards lg:grid-cols-4"
          tiles={[
            {
              label: "Busiest",
              today: null,
              term: "whipsaw",
              value: String(busiest.crossings),
              badge: { text: busiest.symbol, tone: "down" },
              fill: 1,
              fillTone: "down",
              sub: busiest.avgDaysPerRun
                ? `Changes side about every ${busiest.avgDaysPerRun.toFixed(0)} sessions`
                : "Crossings since 2020",
            },
            {
              label: "Median",
              today: null,
              term: "whipsaw",
              value: String(median),
              fill: busiest.crossings ? median / busiest.crossings : 0,
              sub: `Across ${rows.length} ${who}${isNifty ? "" : " past and present"}`,
            },
            {
              label: "Calmest",
              today: null,
              term: "whipsaw",
              value: String(calmest?.crossings ?? 0),
              badge: calmest ? { text: calmest.symbol, tone: "up" } : undefined,
              fill: busiest.crossings ? (calmest?.crossings ?? 0) / busiest.crossings : 0,
              fillTone: "up",
              sub: "Fewest crossings in the index",
            },
            {
              label: "Total crossings",
              today: null,
              term: "whipsaw",
              value: formatInt(total),
              sub: `Every ${isNifty ? "constituent" : "member"}, vs the ${label}`,
            },
          ]}
        />
      )}

      <div className="grid gap-cards xl:grid-cols-12">
        <Card className="self-start xl:col-span-5">
          <CardHeader>
            <div>
              <CardTitle>{rows.length > 12 ? "The twelve busiest" : `All ${rows.length}, busiest first`}</CardTitle>
              <CardDescription>Crossings of the {label}, since 2020</CardDescription>
            </div>
          </CardHeader>
          <div className="px-3 pb-4">
            <CrossingsBars
              data={rows.slice(0, 12).map((r) => ({
                symbol: r.symbol,
                crossings: r.crossings,
                avgRun: r.avgDaysPerRun,
              }))}
            />
          </div>
        </Card>

        <Card className="flex flex-col overflow-hidden xl:col-span-7">
          <CardHeader className="border-b pb-3.5 pt-3.5">
            <div>
              <CardTitle>{isNifty ? "All constituents" : `Every ${ix.label} member since 2020`}</CardTitle>
              <CardDescription>Sorted by crossings, busiest first</CardDescription>
            </div>
            <Badge variant="neutral">{rows.length} stocks</Badge>
          </CardHeader>
          <CrossingsTable rows={rows} maLabel={label} cards={cards} />
          <CardFooter className="mt-auto">
            A crossing counts only between consecutive sessions that both have an average, so
            neither the start of the averaging window nor a gap in the data can fake one.
          </CardFooter>
        </Card>
      </div>
    </AppShell>
  );
}
