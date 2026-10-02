import Link from "next/link";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import MaTabs from "@/components/MaTabs";
import DateNav from "@/components/DateNav";
import Readout, { type Tile } from "@/components/Readout";
import ScreenerTable from "@/components/ScreenerTable";
import VolumeTrack from "@/components/VolumeTrack";
import Hotkeys from "@/components/Hotkeys";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatDate, signed } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MA_LABELS, adjacentSessions, resolveSession, type MaKind } from "@/query/breadth";
import { HISTORY_START } from "@/ingest/nifty50-history";
import { NEAR_PCT, isNear, percentile, screenerOn, volumeAtLeast, type ScreenerRow } from "@/query/screener";
import { GLOSSARY } from "@/lib/glossary";
import Term from "@/components/Term";
import SlidingPill from "@/components/SlidingPill";

export const dynamic = "force-dynamic";

// Every search param is checked against a fixed set of strict comparisons and
// falls back to its default, the same rule as `ma` (CLAUDE.md, sql.raw).
function isMaKind(v: string | undefined): v is MaKind {
  return v === "sma200" || v === "ema200" || v === "sma50";
}
type View = "above" | "below" | "near";
function isView(v: string | undefined): v is View {
  return v === "above" || v === "below" || v === "near";
}
const VOLUMES = { any: 0, "1.5": 1.5, "2": 2, "3": 3 } as const;
type Vol = keyof typeof VOLUMES;
function isVol(v: string | undefined): v is Vol {
  return v === "any" || v === "1.5" || v === "2" || v === "3";
}
function cleanDate(v: string | undefined): string | undefined {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}

/** "A", "A and B", "A, B and C", "A, B, C and 2 more". */
function names(list: string[]): string {
  if (list.length <= 1) return list[0] ?? "";
  if (list.length <= 3) return `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
  return `${list.slice(0, 3).join(", ")} and ${list.length - 3} more`;
}

const head = "h-9 px-3 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground";
const seg = (on: boolean) =>
  cn(
    "inline-flex h-8 items-center gap-2 rounded-[8px] px-3 text-[13px] font-medium transition-colors",
    on ? "bg-thumb text-foreground shadow-thumb" : "text-muted-foreground hover:text-foreground",
  );

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ma?: string; date?: string; view?: string; vol?: string }>;
}) {
  const sp = await searchParams;
  const ma: MaKind = isMaKind(sp.ma) ? sp.ma : "sma200";
  const view: View = isView(sp.view) ? sp.view : "above";
  const vol: Vol = isVol(sp.vol) ? sp.vol : "2";
  const wanted = cleanDate(sp.date);
  const label = MA_LABELS[ma];

  const date = await resolveSession(ma, wanted);
  const nav = date ? await adjacentSessions(ma, date) : { prev: null, next: null };
  const { rows } = date ? await screenerOn(ma, date) : { rows: [] as ScreenerRow[] };
  const latest = await resolveSession(ma);

  const byVol = (a: ScreenerRow, b: ScreenerRow) => (b.volRatio ?? 0) - (a.volRatio ?? 0);
  const above = rows.filter((r) => r.cross === "above").sort(byVol);
  const below = rows.filter((r) => r.cross === "below").sort(byVol);
  const near = rows
    .filter((r) => r.pctFromMa !== null && isNear(r.pctFromMa))
    .sort((a, b) => Math.abs(a.pctFromMa!) - Math.abs(b.pctFromMa!));
  const nearBelow = near.filter((r) => r.pctFromMa! <= 0);
  const nearAbove = near.filter((r) => r.pctFromMa! > 0);

  const min = VOLUMES[vol];
  const passes = (r: ScreenerRow) => volumeAtLeast(r.volRatio, min);
  const crossers = view === "below" ? below : above;
  const listed = view === "near" ? near : crossers.filter(passes);
  const hidden = view === "near" ? [] : crossers.filter((r) => !passes(r));

  const strong = (list: ScreenerRow[]) => list.filter((r) => volumeAtLeast(r.volRatio, 2)).length;
  const crossRatios = [...above, ...below].map((r) => r.volRatio).filter((v): v is number => v !== null);

  const tiles: Tile[] = [
    {
      label: "Crossed above today",
      term: "crossing",
      value: String(above.length),
      badge: strong(above) ? { text: `${strong(above)} on ≥2× volume`, tone: "up" } : undefined,
      sub: above.length ? names(above.map((r) => r.symbol)) : "None",
    },
    {
      label: "Crossed below today",
      term: "crossing",
      value: String(below.length),
      badge: strong(below) ? { text: `${strong(below)} on ≥2× volume`, tone: "down" } : undefined,
      sub: below.length
        ? below[0]!.volRatio !== null
          ? `${below[0]!.symbol} led, on ${below[0]!.volRatio.toFixed(1)}× its usual volume`
          : names(below.map((r) => r.symbol))
        : "None",
    },
    {
      label: `Within ${NEAR_PCT}% of the line`,
      term: "near-the-line",
      value: String(near.length),
      sub: `${nearBelow.length} just below it, ${nearAbove.length} just above it`,
    },
    {
      label: "Median volume, today's crossers",
      term: "volume-ratio",
      value: crossRatios.length ? percentile(crossRatios, 50).toFixed(1) : "—",
      unit: crossRatios.length ? "×" : undefined,
      sub: "Against each stock's 20-session average",
    },
  ];

  const href = (p: { view?: View; vol?: Vol }) =>
    `/screener?ma=${ma}${date && wanted ? `&date=${date}` : ""}&view=${p.view ?? view}&vol=${p.vol ?? vol}`;
  const viewLabel = view === "above" ? `Crossed above the ${label}` : view === "below" ? `Crossed below the ${label}` : `Within ${NEAR_PCT}% of the ${label}`;
  const viewDesc =
    view === "near"
      ? `Closest first, ${formatDate(date)}. The volume filter doesn't apply here.`
      : `${min === 0 ? "On any volume" : `On at least ${vol}× their usual volume`}, ${formatDate(date)}`;
  const empty =
    view === "near"
      ? `No constituent closed within ${NEAR_PCT}% of its ${label} on ${formatDate(date)}.`
      : `No constituent crossed ${view} its ${label} on ${formatDate(date)}${hidden.length ? " on that much volume" : ""}.`;

  return (
    <AppShell current="screener" ma={ma} asOf={latest}>
      <Hotkeys ma={ma} prev={nav.prev} next={nav.next} page="screener" />

      <PageHeader
        eyebrow="NIFTY 50 · Stocks"
        title="Screener"
        description="Stocks that crossed their average on the session, and the ones about to. Volume says whether the move had conviction behind it."
        actions={
          <>
            <MaTabs base="/screener" ma={ma} date={wanted && date ? date : undefined} extra={`&view=${view}&vol=${vol}`} />
            <DateNav
              base="/screener"
              extra={`&view=${view}&vol=${vol}`}
              ma={ma}
              date={date}
              requested={wanted ?? null}
              snapped={Boolean(wanted && date && date !== wanted)}
              prev={nav.prev}
              next={nav.next}
              min={HISTORY_START}
              max={latest}
            />
          </>
        }
      />

      {!date ? (
        <Card className="px-6 py-12 text-center">
          <p className="text-heading text-foreground">Nothing loaded for that session</p>
          <p className="mt-2 text-[13px] text-foreground-2">
            Run <code className="rounded-sm bg-raised px-1.5 py-0.5 font-mono text-[12px]">bun run indicators</code>.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <Readout className="grid-cols-2 lg:grid-cols-4" tiles={tiles} />

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
              <div className="seg relative inline-flex items-center gap-0.5 rounded-md border bg-raised p-0.5" role="tablist" aria-label="Signal">
                <SlidingPill active={view} />
                {([["above", "Crossed above", above.length], ["below", "Crossed below", below.length], ["near", "Near the line", near.length]] as const).map(([k, text, n]) => (
                  <Link key={k} href={href({ view: k })} role="tab" aria-selected={view === k} className={seg(view === k)}>
                    {text}
                    <span className="font-mono text-[11px] text-muted-foreground">{n}</span>
                  </Link>
                ))}
              </div>
              <div className={cn("flex items-center gap-2", view === "near" && "opacity-40")}>
                <span id="vol-label" className="text-[12px] font-medium text-muted-foreground">Volume</span>
                <div className="seg relative inline-flex items-center gap-0.5 rounded-md border bg-raised p-0.5" role="group" aria-labelledby="vol-label">
                  <SlidingPill active={vol} />
                  {(["any", "1.5", "2", "3"] as const).map((v) => (
                    <Link key={v} href={href({ vol: v })} aria-pressed={vol === v} className={cn(seg(vol === v), "h-7 px-2.5 text-[12px]")}>
                      {v === "any" ? "Any" : `≥${v}×`}
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-4">
              <div>
                <h2 className="text-heading text-foreground">{viewLabel}</h2>
                <p className="mt-0.5 text-[12px] text-muted-foreground">{viewDesc}</p>
              </div>
              <Badge variant="neutral">
                {listed.length} {listed.length === 1 ? "stock" : "stocks"}
              </Badge>
            </div>

            <ScreenerTable rows={listed} view={view} maLabel={label} empty={empty} />

            {hidden.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3 text-[12px] text-foreground-2">
                <span>
                  {hidden.length} more crossed {view} on lighter volume:{" "}
                  {hidden.slice(0, 4).map((r, i) => (
                    <span key={r.symbol}>
                      {i > 0 && ", "}
                      <strong className="font-semibold text-foreground">{r.symbol}</strong>
                      {r.volRatio !== null && ` ${r.volRatio.toFixed(1)}×`}
                    </span>
                  ))}
                  {hidden.length > 4 && ` and ${hidden.length - 4} more`}.
                </span>
                <Link href={href({ vol: "any" })} className="font-medium text-brand hover:underline">
                  Show all volumes
                </Link>
              </div>
            )}
          </Card>

          <div className="mt-2">
            <h2 className="text-heading text-foreground"><Term id="near-the-line">Near the line</Term></h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">Within {NEAR_PCT}% of the {label}, closest first</p>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <NearCard title="Could cross up next" desc="Just below the average" rows={nearBelow} tone="down" />
            <NearCard title="Could cross down next" desc="Just above the average" rows={nearAbove} tone="up" />
          </div>
        </div>
      )}
    </AppShell>
  );
}

function NearCard({ title, desc, rows, tone }: { title: string; desc: string; rows: ScreenerRow[]; tone: "up" | "down" }) {
  return (
    <Card className="self-start overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
        <div>
          <h3 className="text-heading text-foreground">{title}</h3>
          <p className="mt-0.5 text-[12px] text-muted-foreground">{desc}</p>
        </div>
        <Badge variant={tone}>
          {rows.length} {tone === "down" ? "below" : "above"}
        </Badge>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-[13px] text-muted-foreground">None within {NEAR_PCT}% on this side.</p>
      ) : (
        <Table className="tabular-nums">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(head, "pl-5")}>Symbol</TableHead>
              <TableHead className={cn(head, "text-right")}>Gap now</TableHead>
              <TableHead className={cn(head, "text-right")}>5 sessions ago</TableHead>
              <TableHead className={cn(head, "pr-5 text-right")} title={GLOSSARY["volume-ratio"].short}>Volume vs 20d</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.symbol} className="hover:bg-raised">
                <TableCell className="py-2.5 pl-5 pr-3 text-[13px] font-semibold text-foreground"><Link href={`/stock/${encodeURIComponent(r.symbol)}`} prefetch={false} className="hover:underline">{r.symbol}</Link></TableCell>
                <TableCell className={cn("px-3 py-2.5 text-right text-[13px] font-medium", tone === "down" ? "text-down" : "text-up")}>
                  {signed(r.pctFromMa!, 2)}%
                </TableCell>
                <TableCell className="px-3 py-2.5 text-right text-[13px] text-muted-foreground">
                  {r.gap5 === null ? "—" : `${signed(r.gap5, 2)}%`}
                </TableCell>
                <TableCell className="py-2.5 pl-3 pr-5 text-right text-[13px] text-foreground">
                  <VolumeTrack ratio={r.volRatio} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
