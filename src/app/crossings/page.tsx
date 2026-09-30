import SiteNav from "@/components/SiteNav";
import MaTabs from "@/components/MaTabs";
import Readout from "@/components/Readout";
import CrossingsTable from "@/components/CrossingsTable";
import CrossingsBars from "@/components/CrossingsBars";
import Hotkeys from "@/components/Hotkeys";
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
    <main className="mx-auto flex max-w-6xl flex-col px-4 pb-20 pt-6 lg:h-full lg:overflow-y-auto lg:pb-5">
      <SiteNav current="crossings" ma={ma} asOf={asOf} />
      <Hotkeys ma={ma} page="crossings" />

      <div className="mb-4 flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-base font-medium">How often each stock crosses its average</h1>
          <p className="mt-0.5 max-w-[70ch] text-xs text-muted-foreground">
            Whipsaw, not strength. A name that crosses every few weeks produces signals worth
            distrusting; one that crosses twice a decade means something when it does.
          </p>
        </div>
        <MaTabs base="/crossings" ma={ma} />
      </div>

      {busiest && (
        <div className="shrink-0">
        <Readout
          cells={[
            {
              value: String(busiest.crossings),
              label: `crossings by ${busiest.symbol}, the busiest`,
              fill: 1,
              tone: "down",
              hint: busiest.avgDaysPerRun ? `one every ${busiest.avgDaysPerRun.toFixed(0)}d` : undefined,
            },
            {
              value: String(median),
              label: "median across the index",
              fill: busiest.crossings ? median / busiest.crossings : 0,
              tone: "neutral",
            },
            {
              value: String(calmest?.crossings ?? 0),
              label: `crossings by ${calmest?.symbol ?? "—"}, the calmest`,
              fill: busiest.crossings ? (calmest?.crossings ?? 0) / busiest.crossings : 0,
              tone: "up",
            },
            {
              value: String(total),
              label: `crossings in total, across ${rows.length} constituents`,
              tone: "neutral",
            },
          ]}
        />
        </div>
      )}

      {/* Side by side on a wide screen: stacking a 260px chart above the table
          starved it of height. Below xl they stack and the page scrolls. */}
      <div className="mt-4 grid gap-4 xl:min-h-[300px] xl:flex-1 xl:grid-cols-[minmax(0,380px)_1fr]">
        <section className="self-start rounded-lg border bg-card">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-2.5">
            <h2 className="text-sm font-medium">The twelve busiest</h2>
            <p className="font-mono text-xs text-muted-foreground">vs the {label}</p>
          </div>
          <div className="px-2 pb-3 pt-3">
            <CrossingsBars
              data={rows.slice(0, 12).map((r) => ({
                symbol: r.symbol,
                crossings: r.crossings,
                avgRun: r.avgDaysPerRun,
              }))}
            />
          </div>
        </section>

        <section className="flex min-h-[280px] flex-col rounded-lg border bg-card xl:min-h-0">
          <div className="flex shrink-0 flex-wrap items-baseline justify-between gap-2 border-b px-4 py-2.5">
            <h2 className="text-sm font-medium">All {rows.length} constituents</h2>
            <p className="font-mono text-xs text-muted-foreground">ten years</p>
          </div>
          <CrossingsTable rows={rows} maLabel={label} />
          <p className="shrink-0 border-t px-4 py-2 text-xs text-muted-foreground">
            A crossing counts only between consecutive sessions that both have an average, so
            neither the start of the averaging window nor a gap in the data can fake one.
          </p>
        </section>
      </div>

    </main>
  );
}
