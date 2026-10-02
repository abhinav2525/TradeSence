import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import DateNav from "@/components/DateNav";
import Readout, { type Tile } from "@/components/Readout";
import AdHero from "@/components/AdHero";
import AdLineChart from "@/components/AdLineChart";
import McClellanBars from "@/components/McClellanBars";
import AdRecentTable from "@/components/AdRecentTable";
import Hotkeys from "@/components/Hotkeys";
import { Card, CardFooter } from "@/components/ui/card";
import { formatDate, signed } from "@/lib/format";
import { advanceDeclineSeries, type AdPoint } from "@/query/advance-decline";
import type { MaKind } from "@/query/breadth";

export const dynamic = "force-dynamic";

// The average doesn't change this page; it is only carried so the nav and the
// 1/2/3 keys keep the reader's choice when they move between pages. Validated
// the same strict way as every page (CLAUDE.md, sql.raw).
function isMaKind(v: string | undefined): v is MaKind {
  return v === "sma200" || v === "ema200" || v === "sma50";
}

function cleanDate(v: string | undefined): string | undefined {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}

/** Below this change over 20 sessions the summation index reads as flat. */
const SUMMATION_FLAT = 10;
const OSCILLATOR_SESSIONS = 120;

/** Sessions in a row, ending at i, on the same side of zero as series[i]. */
function sameSideRun(series: AdPoint[], i: number): number {
  const sign = Math.sign(series[i]?.mcclellan ?? 0);
  let n = 0;
  for (let j = i; j >= 0 && series[j]!.mcclellan !== null && Math.sign(series[j]!.mcclellan!) === sign; j--) n++;
  return n;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ma?: string; date?: string }>;
}) {
  const { ma: rawMa, date: rawDate } = await searchParams;
  const ma: MaKind = isMaKind(rawMa) ? rawMa : "sma200";
  const wanted = cleanDate(rawDate);

  const series = await advanceDeclineSeries();

  // A date that isn't a session snaps back to the one before it, like Breadth.
  let idx = series.length - 1;
  if (wanted) {
    idx = -1;
    for (let i = series.length - 1; i >= 0; i--) if (series[i]!.date <= wanted) { idx = i; break; }
  }
  const p = idx >= 0 ? series[idx] : undefined;
  const snapped = Boolean(wanted && p && p.date !== wanted);
  const prev = idx > 0 ? series[idx - 1]!.date : null;
  const next = idx >= 0 && idx < series.length - 1 ? series[idx + 1]!.date : null;

  const last20 = idx >= 0 ? series.slice(Math.max(0, idx - 19), idx + 1) : [];
  const then = idx >= 20 ? series[idx - 20] : undefined;

  const tiles: Tile[] = p
    ? [
        {
          label: "McClellan",
          term: "mcclellan",
          value: p.mcclellan === null ? "—" : signed(p.mcclellan, 1),
          badge:
            p.mcclellan === null
              ? undefined
              : p.mcclellan >= 0
                ? { text: "Above zero", tone: "up" }
                : { text: "Below zero", tone: "down" },
          sub:
            p.mcclellan === null
              ? "Needs 39 sessions of history"
              : `${p.mcclellan >= 0 ? "Positive" : "Negative"} for ${sameSideRun(series, idx)} sessions`,
        },
        (() => {
          const now = p.summation;
          const before = then?.summation ?? null;
          const delta = now !== null && before !== null ? now - before : null;
          return {
            label: "Summation index",
            term: "summation-index",
            value: now === null ? "—" : signed(now),
            badge:
              delta === null
                ? undefined
                : Math.abs(delta) < SUMMATION_FLAT
                  ? { text: "Flat", tone: "neutral" as const }
                  : delta > 0
                    ? { text: "Rising", tone: "up" as const }
                    : { text: "Falling", tone: "down" as const },
            sub: before === null ? "Not enough history yet" : `${signed(before)} twenty sessions ago`,
          };
        })(),
        {
          label: "10-day advancing share",
          term: "advancing-share-10d",
          value: p.adv10 === null ? "—" : p.adv10.toFixed(1),
          unit: p.adv10 === null ? undefined : "%",
          fill: p.adv10 === null ? undefined : p.adv10 / 100,
          sub: "A thrust needs under 40%, then over 61.5% within 10 sessions",
        },
        {
          label: "Advancing sessions",
          today: null,
          term: "advancers-decliners",
          value: String(last20.filter((s) => s.net > 0).length),
          unit: `of ${last20.length}`,
          sub: `More risers than fallers, last ${last20.length} sessions`,
        },
      ]
    : [];

  return (
    <AppShell current="advance-decline" ma={ma} asOf={series.at(-1)?.date}>
      <Hotkeys ma={ma} prev={prev} next={next} page="advance-decline" />

      <PageHeader
        eyebrow="NIFTY 50 · Market"
        title="Advance/Decline"
        description="How many constituents rose against how many fell, every session. The line adds it up; the McClellan oscillator measures its momentum."
        actions={
          <DateNav
            base="/advance-decline"
            ma={ma}
            date={p?.date ?? null}
            requested={wanted ?? null}
            snapped={snapped}
            prev={prev}
            next={next}
            min={series[0]?.date ?? null}
            max={series.at(-1)?.date ?? null}
          />
        }
      />

      {!p ? (
        <Card className="px-6 py-12 text-center">
          <p className="text-heading text-foreground">Nothing loaded for that session</p>
          <p className="mt-2 text-[13px] text-foreground-2">
            Advance/Decline starts on {formatDate(series[0]?.date)}. If nothing is loaded, run{" "}
            <code className="rounded-sm bg-raised px-1.5 py-0.5 font-mono text-[12px]">bun run indicators</code>.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-12">
          <AdHero
            className="lg:col-span-12 xl:col-span-7"
            date={p.date}
            advancing={p.advancing}
            declining={p.declining}
            unchanged={p.unchanged}
            net={p.net}
            recent={last20.map((s) => ({ date: s.date, advancing: s.advancing, declining: s.declining, net: s.net }))}
          />
          <Readout className="lg:col-span-12 lg:grid-cols-4 xl:col-span-5 xl:grid-cols-2" tiles={tiles} />

          <Card className="lg:col-span-12">
            <AdLineChart data={series.map((s) => ({ date: s.date, net: s.net }))} selectedDate={wanted ? p.date : null} />
            <CardFooter>
              The level is arbitrary; the slope is the reading. A line that falls while the index holds
              near its high is a divergence worth watching.
            </CardFooter>
          </Card>

          <Card className="self-start lg:col-span-12 xl:col-span-8">
            <McClellanBars
              data={series
                .slice(Math.max(0, idx - OSCILLATOR_SESSIONS + 1), idx + 1)
                .filter((s) => s.mcclellan !== null)
                .map((s) => ({ date: s.date, value: Math.round(s.mcclellan! * 10) / 10 }))}
            />
            <CardFooter>
              19-day EMA minus 39-day EMA of (advancing − declining) ÷ (advancing + declining) × 1,000.
              Ratio adjustment keeps a 50-stock reading on a stable scale.
            </CardFooter>
          </Card>

          <AdRecentTable
            className="self-start lg:col-span-12 xl:col-span-4"
            rows={series.slice(Math.max(0, idx - 7), idx + 1).reverse()}
          />
        </div>
      )}
    </AppShell>
  );
}
