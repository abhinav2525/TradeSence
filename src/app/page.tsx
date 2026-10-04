import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import MaTabs from "@/components/MaTabs";
import DateNav from "@/components/DateNav";
import Readout, { type Tile } from "@/components/Readout";
import BreadthHero, { type Bin } from "@/components/BreadthHero";
import BreadthArea, { type AreaPoint } from "@/components/BreadthArea";
import MemberTable from "@/components/MemberTable";
import Hotkeys from "@/components/Hotkeys";
import WashoutNotice from "@/components/WashoutNotice";
import { noticeText, noticeVisible } from "@/components/signals-copy";
import { Card, CardFooter } from "@/components/ui/card";
import { formatDate, signed } from "@/lib/format";
import Term from "@/components/Term";
import {
  breadthSeries, breakdownOn, adjacentSessions, universeSeries, MA_LABELS, type BreadthPoint, type MaKind,
} from "@/query/breadth";
import { LIST_UNIVERSES, cleanUniverse, pickSession, type Universe } from "@/indicators/breadth-universes";
import { signalsData } from "@/query/signals";

export const dynamic = "force-dynamic";

function isMaKind(v: string | undefined): v is MaKind {
  return v === "sma200" || v === "ema200" || v === "sma50";
}

function cleanDate(v: string | undefined): string | undefined {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}

/** Twenty 5%-wide bins over 0-100; a reading of exactly 100 joins the top bin. */
function histogram(series: BreadthPoint[]): Bin[] {
  const bins: Bin[] = Array.from({ length: 20 }, (_, i) => ({ from: i * 5, to: i * 5 + 5, count: 0 }));
  for (const p of series) bins[binOf(p.pctAbove)]!.count += 1;
  return bins;
}

function binOf(pct: number): number {
  return Math.min(19, Math.max(0, Math.floor(pct / 5)));
}

// Breadth beyond the NIFTY 50 (decision 0030). `u` is checked by cleanUniverse against
// fixed keys; the NIFTY 50 path below is unchanged.
const GROUP_LABEL = { broad: "Broad market", sector: "Sectors", theme: "Themes" } as const;
const universeName = (u: Universe) => (u === "nifty50" ? "NIFTY 50" : u === "market" ? "Whole market" : LIST_UNIVERSES.find((x) => x.key === u)!.name);
const universeOf = (u: Universe) => (u === "nifty50" ? "NIFTY 50 constituents" : u === "market" ? "liquid NSE companies" : `${universeName(u)} members`);
const MIN_HISTORY = 20; // sessions before a percentile means anything


export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ma?: string; date?: string; u?: string }>;
}) {
  const { ma: rawMa, date: rawDate, u: rawU } = await searchParams;
  const u = cleanUniverse(rawU);
  const isNifty = u === "nifty50";
  const keep = isNifty ? "" : `&u=${u}`;
  const ma: MaKind = isMaKind(rawMa) ? rawMa : "sma200";
  const label = MA_LABELS[ma];
  const wanted = cleanDate(rawDate);

  const [series, niftyView, signals] = await Promise.all([
    isNifty ? breadthSeries(ma) : universeSeries(u, ma),
    isNifty ? breakdownOn(ma, wanted) : null,
    signalsData(),
  ]);
  const view = niftyView ?? { ...pickSession(series, wanted), above: [], below: [] };
  const idx = view.date ? series.findIndex((p) => p.date === view.date) : series.length - 1;
  const point = idx >= 0 ? series[idx] : undefined;

  // Today's washout, only while it is Active and the reader is on the latest session.
  const six = signals.horizons.under.find((h) => h.key === "6m");
  const notice = isNifty && six && noticeVisible(signals.washout?.status, view.date, signals.washout?.date) ? noticeText(six) : null;
  const at = view.date ? series.findIndex((p) => p.date === view.date) : -1;
  const nav = !view.date ? { prev: null, next: null }
    : isNifty ? await adjacentSessions(ma, view.date)
    : { prev: series[at - 1]?.date ?? null, next: series[at + 1]?.date ?? null };
  const since = series[0] ? series[0].date.slice(0, 4) : "";
  const building = series.length < MIN_HISTORY;

  // Trimmed for the wire: the chart needs four fields, not the whole row.
  const chart: AreaPoint[] = series.map((p) => ({
    date: p.date,
    pct: Math.round(p.pctAbove * 10) / 10,
    above: p.above,
    total: p.total,
  }));

  // How rare is this reading? That is the question the history since 2020 exists to answer.
  const percentile = point
    ? (series.filter((p) => p.pctAbove <= point.pctAbove).length / series.length) * 100
    : 0;

  // Direction over the last five sessions, so the number is not read in isolation.
  const prior = idx >= 5 ? series[idx - 5] : undefined;
  const delta = point && prior ? point.pctAbove - prior.pctAbove : null;

  // The long-run centre and the last year's band, as context for today.
  const average = series.length ? series.reduce((s, p) => s + p.pctAbove, 0) / series.length : 0;
  const year = idx >= 0 ? series.slice(Math.max(0, idx - 249), idx + 1).map((p) => p.pctAbove) : [];
  const yearLo = year.length ? Math.min(...year) : 0;
  const yearHi = year.length ? Math.max(...year) : 0;

  const tiles: Tile[] = point
    ? [
        building ? {
          label: "Percentile",
          term: "percentile",
          value: "—",
          badge: { text: "History building", tone: "neutral" },
          sub: `${series.length} session${series.length === 1 ? "" : "s"} saved since ${formatDate(series[0]!.date)}; a percentile needs ${MIN_HISTORY}`,
        } : {
          label: "Percentile",
          term: "percentile",
          value: percentile.toFixed(1),
          badge:
            percentile <= 10
              ? { text: "Rare low", tone: "down" }
              : percentile >= 90
                ? { text: "Rare high", tone: "up" }
                : { text: "Ordinary", tone: "neutral" },
          fill: percentile / 100,
          fillTone: percentile <= 20 ? "down" : percentile >= 80 ? "up" : "neutral",
          sub:
            percentile <= 50
              ? `Weaker than ${(100 - percentile).toFixed(0)}% of sessions since ${since}`
              : `Stronger than ${percentile.toFixed(0)}% of sessions since ${since}`,
        },
        {
          label: "Five-session change",
          term: "five-session-change",
          value: delta === null ? "—" : signed(delta),
          unit: delta === null ? undefined : "pts",
          direction: delta === null || Math.round(delta) === 0 ? undefined : delta > 0 ? "up" : "down",
          sub:
            delta === null
              ? "Not enough history yet"
              : `${delta > 0 ? "Improving" : delta < 0 ? "Deteriorating" : "Flat"} since ${formatDate(prior!.date)}`,
        },
        {
          label: `Average since ${since}`,
          today: null,
          term: "breadth",
          value: average.toFixed(0),
          unit: "%",
          fill: average / 100,
          sub: `Today is ${signed(point.pctAbove - average)} pts from it`,
        },
        {
          label: "One-year range",
          today: null,
          term: "breadth",
          value: `${yearLo.toFixed(0)}–${yearHi.toFixed(0)}`,
          unit: "%",
          range: { lo: yearLo, hi: yearHi, now: point.pctAbove },
          sub: `Low and high of the last ${year.length} session${year.length === 1 ? "" : "s"}`,
        },
      ]
    : [];

  return (
    <AppShell current="breadth" ma={ma} asOf={series.at(-1)?.date}>
      <Hotkeys ma={ma} prev={nav.prev} next={nav.next} page="breadth" extra={keep} />

      <PageHeader
        eyebrow={`${universeName(u)} · Market breadth`}
        title="Breadth"
        description={
          isNifty ? "How many of the fifty constituents close above their moving average, and how rare that is against every session since 2020."
          : u === "market" ? `How many liquid NSE companies close above their moving average, and how rare that is against every session since ${since || "2016"}.`
          : `How many ${universeName(u)} members close above their moving average, using today's members. Saved every night from October 2026.`
        }
        actions={
          <>
            <MaTabs base="/" ma={ma} date={wanted} extra={keep} />
            <DateNav
              extra={keep}
              ma={ma}
              date={view.date}
              requested={view.requested}
              snapped={view.snapped}
              prev={nav.prev}
              next={nav.next}
              min={series[0]?.date ?? null}
              max={series.at(-1)?.date ?? null}
            />
          </>
        }
      />

      <form action="/" method="get" className="mb-4 flex flex-wrap items-center gap-2 text-body-sm">
        <input type="hidden" name="ma" value={ma} />
        <label htmlFor="u" className="text-muted-foreground">Breadth of</label>
        <select id="u" name="u" defaultValue={u} className="h-8 rounded-[8px] border border-input bg-card px-2 text-body-sm text-foreground">
          <option value="nifty50">NIFTY 50 (since 2020)</option>
          <option value="market">Whole market (all liquid stocks)</option>
          {(["broad", "sector", "theme"] as const).map((g) => (
            <optgroup key={g} label={GROUP_LABEL[g]}>
              {LIST_UNIVERSES.filter((x) => x.group === g).map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
            </optgroup>
          ))}
        </select>
        <button type="submit" className="h-8 rounded-[8px] border px-3 text-body-sm font-medium text-foreground hover:bg-raised">Show</button>
        {u === "market" && <span className="text-[12px] text-muted-foreground"><Term id="whole-market-breadth">What counts as the whole market</Term></span>}
      </form>

      {!point ? (
        <Card className="px-6 py-12 text-center">
          <p className="text-heading text-foreground">Nothing loaded for that session</p>
          <p className="mt-2 text-body-sm text-foreground-2">
            {isNifty ? (
              <>
                Run <code className="rounded-sm bg-raised px-1.5 py-0.5 font-mono text-[12px]">bun run ingest:backfill</code>{" "}
                then <code className="rounded-sm bg-raised px-1.5 py-0.5 font-mono text-[12px]">bun run indicators</code>.
              </>
            ) : (
              <>Run <code className="rounded-sm bg-raised px-1.5 py-0.5 font-mono text-[12px]">bun run breadth</code> (it also runs every night).</>
            )}
          </p>
        </Card>
      ) : (
        <div className="grid gap-cards lg:grid-cols-12">
          {notice && <WashoutNotice className="lg:col-span-12" text={notice} ma={ma} />}
          <BreadthHero
            className="lg:col-span-12 xl:col-span-7 xl:compact:col-span-12"
            pct={point.pctAbove}
            above={point.above}
            total={point.total}
            maLabel={label}
            date={point.date}
            percentile={percentile}
            bins={histogram(series)}
            current={binOf(point.pctAbove)}
            sessions={series.length}
            of={universeOf(u)}
            rarityNote={building ? `History is building: ${series.length} session${series.length === 1 ? "" : "s"} saved so far.` : undefined}
          />
          <Readout className="lg:col-span-12 lg:grid-cols-4 xl:col-span-5 xl:grid-cols-2 xl:compact:col-span-12 xl:compact:grid-cols-4" tiles={tiles} />

          <Card className="lg:col-span-12">
            <BreadthArea data={chart} selectedDate={view.date} />
            <CardFooter>
              Under the halfway line, most of the index sits below its own long-term average. The
              shaded bands mark the extremes: under 20% and over 80%.
            </CardFooter>
          </Card>

          {isNifty ? (
            <>
              <MemberTable className="lg:col-span-12 xl:col-span-6" title="Above" rows={view.above} tone="up" maLabel={label} />
              <MemberTable className="lg:col-span-12 xl:col-span-6" title="Below" rows={view.below} tone="down" maLabel={label} />
            </>
          ) : (
            <Card className="px-card-x py-card text-body-sm text-foreground-2 lg:col-span-12">
              {u === "market"
                ? "Each day counts every NSE company whose median trading over the 20 sessions before it was ₹1 crore or more (ETFs left out), so the history has no hindsight in it. Stock-by-stock lists are kept for the NIFTY 50."
                : `Counted on ${universeName(u)}'s members as NSE lists them today. History for index lists is saved night by night from ${formatDate(series[0]!.date)} instead of drawn backwards with today's members, which would flatter the past. Stock-by-stock lists are kept for the NIFTY 50.`}
            </Card>
          )}
        </div>
      )}
    </AppShell>
  );
}
