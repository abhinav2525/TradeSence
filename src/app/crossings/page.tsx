import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import MaTabs from "@/components/MaTabs";
import Readout from "@/components/Readout";
import CrossingsTable from "@/components/CrossingsTable";
import CrossingsBars from "@/components/CrossingsBars";
import Hotkeys from "@/components/Hotkeys";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatInt } from "@/lib/format";
import { crossingStats } from "@/query/crossings";
import { MA_LABELS, resolveSession, type MaKind } from "@/query/breadth";

export const dynamic = "force-dynamic";

function isMaKind(v: string | undefined): v is MaKind {
  return v === "sma200" || v === "ema200" || v === "sma50";
}

export default async function CrossingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ma?: string }>;
}) {
  const { ma: raw } = await searchParams;
  const ma: MaKind = isMaKind(raw) ? raw : "sma200";
  const label = MA_LABELS[ma];

  const [rows, asOf] = await Promise.all([crossingStats(ma), resolveSession(ma)]);

  const total = rows.reduce((n, r) => n + r.crossings, 0);
  const busiest = rows[0];
  const calmest = rows.at(-1);
  const median = rows.length
    ? [...rows].map((r) => r.crossings).sort((a, b) => a - b)[Math.floor(rows.length / 2)]!
    : 0;

  return (
    <AppShell current="crossings" ma={ma} asOf={asOf}>
      <Hotkeys ma={ma} page="crossings" />

      <PageHeader
        eyebrow="NIFTY 50 · Whipsaw"
        title="Crossings"
        description="How often each stock crosses its average. Whipsaw, not strength: a name that crosses every few weeks produces signals worth distrusting; one that crosses twice a decade means something when it does."
        actions={<MaTabs base="/crossings" ma={ma} />}
      />

      {busiest && (
        <Readout
          className="mb-4 lg:grid-cols-4"
          tiles={[
            {
              label: "Busiest",
              value: String(busiest.crossings),
              badge: { text: busiest.symbol, tone: "down" },
              fill: 1,
              fillTone: "down",
              sub: busiest.avgDaysPerRun
                ? `Crosses once every ${busiest.avgDaysPerRun.toFixed(0)}d`
                : "Crossings over ten years",
            },
            {
              label: "Median",
              value: String(median),
              fill: busiest.crossings ? median / busiest.crossings : 0,
              sub: `Across ${rows.length} constituents`,
            },
            {
              label: "Calmest",
              value: String(calmest?.crossings ?? 0),
              badge: calmest ? { text: calmest.symbol, tone: "up" } : undefined,
              fill: busiest.crossings ? (calmest?.crossings ?? 0) / busiest.crossings : 0,
              fillTone: "up",
              sub: "Fewest crossings in the index",
            },
            {
              label: "Total crossings",
              value: formatInt(total),
              sub: `Every constituent, vs the ${label}`,
            },
          ]}
        />
      )}

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="self-start xl:col-span-5">
          <CardHeader>
            <div>
              <CardTitle>The twelve busiest</CardTitle>
              <CardDescription>Crossings of the {label}, ten years</CardDescription>
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
              <CardTitle>All constituents</CardTitle>
              <CardDescription>Sorted by crossings, busiest first</CardDescription>
            </div>
            <Badge variant="neutral">{rows.length} stocks</Badge>
          </CardHeader>
          <CrossingsTable rows={rows} maLabel={label} />
          <CardFooter className="mt-auto">
            A crossing counts only between consecutive sessions that both have an average, so
            neither the start of the averaging window nor a gap in the data can fake one.
          </CardFooter>
        </Card>
      </div>
    </AppShell>
  );
}
