import Link from "next/link";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import Hotkeys from "@/components/Hotkeys";
import SlidingPill from "@/components/SlidingPill";
import Term from "@/components/Term";
import VolumeTable, { SIZE_LABEL } from "@/components/VolumeTable";
import { Badge } from "@/components/ui/badge";
import { Card, CardFooter } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MaKind } from "@/query/breadth";
import { INDEX_LISTS, UNIVERSE_KEY } from "@/ingest/index-constituents";
import type { Period } from "@/indicators/volume-leaders";
import { sectorsPresent, topVolume, type RankBy, type SizeGroup } from "@/query/volume";

export const dynamic = "force-dynamic";

// Every search param is checked against a fixed set with strict comparisons and
// falls back to its default (CLAUDE.md); sector and index are checked against
// the lists we hold, so nothing else from the URL reaches SQL.
function isMaKind(v: string | undefined): v is MaKind {
  return v === "sma200" || v === "ema200" || v === "sma50";
}
const PERIOD_LABEL: Record<Period, string> = { 1: "1 day", 5: "1 week", 21: "1 month", 63: "3 months", 126: "6 months" };
const PERIOD_SHORT: Record<Period, string> = { 1: "1D", 5: "1W", 21: "1M", 63: "3M", 126: "6M" }; // phones: one row
function cleanPeriod(v: string | undefined): Period {
  return v === "1" ? 1 : v === "5" ? 5 : v === "63" ? 63 : v === "126" ? 126 : 21;
}
function cleanRank(v: string | undefined): RankBy {
  return v === "shares" ? "shares" : "value";
}
function cleanSize(v: string | undefined): SizeGroup | null {
  return v === "large" || v === "mid" || v === "small" || v === "micro" ? v : null;
}
const PICKABLE = INDEX_LISTS.filter((x) => x.key !== UNIVERSE_KEY);
const GROUP_LABEL = { broad: "Broad market", sector: "Sectors", theme: "Themes" } as const;

const seg = (on: boolean) =>
  cn(
    "inline-flex h-8 items-center gap-2 rounded-[8px] px-3 text-body-sm font-medium transition-colors",
    on ? "bg-thumb text-foreground shadow-thumb" : "text-muted-foreground hover:text-foreground",
  );
const chip = (on: boolean) =>
  cn(
    "inline-flex h-7 items-center rounded-[8px] border px-2.5 text-[12px] font-medium transition-colors",
    on ? "bg-thumb text-foreground shadow-thumb" : "text-muted-foreground hover:text-foreground",
  );
const select = "h-8 rounded-[8px] border border-input bg-card px-2 text-body-sm text-foreground";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ma?: string; period?: string; rank?: string; size?: string; sector?: string; index?: string }>;
}) {
  const sp = await searchParams;
  const ma: MaKind = isMaKind(sp.ma) ? sp.ma : "sma200";
  const period = cleanPeriod(sp.period);
  const rank = cleanRank(sp.rank);
  const size = cleanSize(sp.size);
  const sectors = await sectorsPresent();
  const sector = sp.sector && sectors.includes(sp.sector) ? sp.sector : null;
  const indexKey = sp.index && PICKABLE.some((x) => x.key === sp.index) ? sp.index : null;
  const { asOf, rows } = await topVolume({ period, rank, size, sector, indexKey });

  const state = { period: String(period), rank, size: size ?? "", sector: sector ?? "", index: indexKey ?? "" };
  const href = (p: Partial<typeof state>) => {
    const q = new URLSearchParams({ ma, ...state, ...p });
    for (const [k, v] of [...q.entries()]) if (v === "") q.delete(k);
    return `/volume?${q.toString()}`;
  };
  const filterNote = [size && SIZE_LABEL[size], sector, indexKey && PICKABLE.find((x) => x.key === indexKey)!.name].filter(Boolean).join(" · ");

  return (
    <AppShell current="volume" ma={ma} asOf={asOf}>
      <Hotkeys ma={ma} page="volume" />
      <PageHeader
        eyebrow="Nifty Total Market · Stocks"
        title="Top volume"
        description="The most-traded stocks over the period, by rupees or by shares. Heavy trading shows where money moved, not where prices go next."
      />

      {!asOf ? (
        <Card className="px-6 py-12 text-center">
          <p className="text-heading text-foreground">Nothing loaded yet</p>
          <p className="mt-2 text-body-sm text-foreground-2">
            Run <code className="rounded-sm bg-raised px-1.5 py-0.5 font-mono text-[12px]">bun run ingest:index-lists</code> then{" "}
            <code className="rounded-sm bg-raised px-1.5 py-0.5 font-mono text-[12px]">bun run volume-leaders</code>.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b px-card-x py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="seg relative inline-flex items-center gap-0.5 rounded-md border bg-raised p-0.5" role="tablist" aria-label="Period">
                <SlidingPill active={String(period)} />
                {([1, 5, 21, 63, 126] as const).map((p) => (
                  <Link key={p} href={href({ period: String(p) })} role="tab" aria-selected={period === p} aria-label={PERIOD_LABEL[p]} className={seg(period === p)}>
                    <span className="sm:hidden">{PERIOD_SHORT[p]}</span>
                    <span className="hidden sm:inline">{PERIOD_LABEL[p]}</span>
                  </Link>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span id="rank-label" className="text-[12px] font-medium text-muted-foreground">Rank by</span>
                <div className="seg relative inline-flex items-center gap-0.5 rounded-md border bg-raised p-0.5" role="group" aria-labelledby="rank-label">
                  <SlidingPill active={rank} />
                  <Link href={href({ rank: "value" })} aria-pressed={rank === "value"} className={cn(seg(rank === "value"), "h-7 px-2.5 text-[12px]")}>₹ value</Link>
                  <Link href={href({ rank: "shares" })} aria-pressed={rank === "shares"} className={cn(seg(rank === "shares"), "h-7 px-2.5 text-[12px]")}>Shares</Link>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Size">
                <Link href={href({ size: "" })} aria-pressed={size === null} className={chip(size === null)}>All sizes</Link>
                {(["large", "mid", "small", "micro"] as const).map((s) => (
                  <Link key={s} href={href({ size: s })} aria-pressed={size === s} className={chip(size === s)}>{SIZE_LABEL[s]}</Link>
                ))}
              </div>
              <form action="/volume" method="get" className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="ma" value={ma} />
                <input type="hidden" name="period" value={String(period)} />
                <input type="hidden" name="rank" value={rank} />
                {size && <input type="hidden" name="size" value={size} />}
                <label htmlFor="sector" className="sr-only">Sector</label>
                <select id="sector" name="sector" defaultValue={sector ?? ""} className={select}>
                  <option value="">All sectors</option>
                  {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <label htmlFor="index" className="sr-only">Index</label>
                <select id="index" name="index" defaultValue={indexKey ?? ""} className={select}>
                  <option value="">Any index</option>
                  {(["broad", "sector", "theme"] as const).map((g) => (
                    <optgroup key={g} label={GROUP_LABEL[g]}>
                      {PICKABLE.filter((x) => x.group === g).map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
                    </optgroup>
                  ))}
                </select>
                <button type="submit" className="h-8 rounded-[8px] border px-3 text-body-sm font-medium text-foreground hover:bg-raised">Show</button>
              </form>
            </div>
          </div>

          <div className="flex items-start justify-between gap-3 px-card-x pb-2 pt-4">
            <div>
              <h2 className="text-heading text-foreground">
                <Term id="top-volume">Most traded</Term> over {PERIOD_LABEL[period]} to {formatDate(asOf)}
              </h2>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Ranked by {rank === "value" ? "rupees traded" : "shares traded"}{filterNote ? ` · ${filterNote}` : ""}.
              </p>
            </div>
            <Badge variant="neutral">{rows.length} {rows.length === 1 ? "stock" : "stocks"}</Badge>
          </div>

          <VolumeTable rows={rows} rank={rank} period={period} empty="No stock matches these filters." />
          <CardFooter>
            Index members and sectors as of today, from NSE&apos;s lists. Shares are adjusted for splits and bonuses.
            Report Cards cover stocks that have been in the NIFTY 50 since 2020.
          </CardFooter>
        </Card>
      )}
    </AppShell>
  );
}
