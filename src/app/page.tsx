import SiteNav from "@/components/SiteNav";
import MaTabs from "@/components/MaTabs";
import DateNav from "@/components/DateNav";
import Readout from "@/components/Readout";
import BreadthArea, { type AreaPoint } from "@/components/BreadthArea";
import BreadthGauge from "@/components/BreadthGauge";
import MemberTable from "@/components/MemberTable";
import Hotkeys from "@/components/Hotkeys";
import {
  breadthSeries, breakdownOn, adjacentSessions, MA_LABELS, type MaKind,
} from "@/query/breadth";

export const dynamic = "force-dynamic";

function isMaKind(v: string | undefined): v is MaKind {
  return v === "sma200" || v === "ema200" || v === "sma50";
}

function cleanDate(v: string | undefined): string | undefined {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ma?: string; date?: string }>;
}) {
  const { ma: rawMa, date: rawDate } = await searchParams;
  const ma: MaKind = isMaKind(rawMa) ? rawMa : "sma200";
  const label = MA_LABELS[ma];
  const wanted = cleanDate(rawDate);

  const [series, view] = await Promise.all([breadthSeries(ma), breakdownOn(ma, wanted)]);
  const idx = view.date ? series.findIndex((p) => p.date === view.date) : series.length - 1;
  const point = idx >= 0 ? series[idx] : undefined;
  const nav = view.date ? await adjacentSessions(ma, view.date) : { prev: null, next: null };

  // Trimmed for the wire: the chart needs three fields, not the whole row.
  const chart: AreaPoint[] = series.map((p) => ({
    date: p.date,
    pct: Math.round(p.pctAbove * 10) / 10,
    above: p.above,
    total: p.total,
  }));

  // How rare is this reading? That is the question the ten years exist to answer.
  const percentile = point
    ? (series.filter((p) => p.pctAbove <= point.pctAbove).length / series.length) * 100
    : 0;

  // Direction over the last five sessions, so the number is not read in isolation.
  const prior = idx >= 5 ? series[idx - 5] : undefined;
  const delta = point && prior ? point.pctAbove - prior.pctAbove : null;

  return (
    <main className="mx-auto flex max-w-6xl flex-col px-4 pb-20 pt-6 lg:h-full lg:overflow-y-auto lg:pb-5">
      <SiteNav current="breadth" ma={ma} asOf={view.date} />
      <Hotkeys ma={ma} prev={nav.prev} next={nav.next} page="breadth" />

      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <MaTabs base="/" ma={ma} date={wanted} />
        <DateNav
          ma={ma}
          date={view.date}
          requested={view.requested}
          snapped={view.snapped}
          prev={nav.prev}
          next={nav.next}
          min={series[0]?.date ?? null}
          max={series.at(-1)?.date ?? null}
        />
      </div>

      {!point ? (
        <div className="shrink-0 rounded-lg border bg-card px-4 py-10 text-sm text-muted-foreground">
          Nothing loaded for that session. Run{" "}
          <code className="font-mono text-xs">bun run ingest:backfill</code> then{" "}
          <code className="font-mono text-xs">bun run indicators</code>.
        </div>
      ) : (
        <>
          <div className="grid shrink-0 gap-4 lg:grid-cols-[190px_1fr]">
            <div className="flex items-center justify-center rounded-lg border bg-card py-2">
              <BreadthGauge pct={point.pctAbove} percentile={percentile} />
            </div>
            <Readout
              cols={3}
              cells={[
                {
                  value: `${percentile.toFixed(1)}`,
                  label: "percentile over ten years",
                  fill: percentile / 100,
                  tone: percentile <= 20 ? "down" : percentile >= 80 ? "up" : "neutral",
                  hint: percentile <= 10 || percentile >= 90 ? "rare" : "ordinary",
                },
                {
                  value: `${point.above}/${point.total}`,
                  label: "constituents above the line",
                  tone: "neutral",
                  hint: `${label}`,
                },
                {
                  value: delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(0)}`,
                  label: "change over five sessions",
                  tone: delta === null ? "neutral" : delta > 0 ? "up" : "down",
                  hint: delta === null ? undefined : delta > 0 ? "improving" : "deteriorating",
                },
              ]}
            />
          </div>

          <section className="mt-4 shrink-0 rounded-lg border bg-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
              <h2 className="text-sm font-medium">Ten years of breadth</h2>
              <p className="font-mono text-xs text-muted-foreground">
                {series[0]?.date} to {series.at(-1)?.date}
              </p>
            </div>
            <div className="px-2 pb-3 pt-4">
              <BreadthArea data={chart} selectedDate={view.date} />
            </div>
            <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
              Under the halfway line, most of the index sits below its own long-term average.
            </p>
          </section>

          {/* takes whatever height is left; min-h-0 is what lets the children
              scroll instead of stretching the page */}
          {/* the browse region: takes what is left, never collapses below a
              readable number of rows */}
          <div className="mt-4 grid gap-4 lg:min-h-[280px] lg:flex-1 lg:grid-cols-2">
            <MemberTable title="Above" rows={view.above} tone="up" maLabel={label} />
            <MemberTable title="Below" rows={view.below} tone="down" maLabel={label} />
          </div>
        </>
      )}
    </main>
  );
}
