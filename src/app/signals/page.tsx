import { Info } from "lucide-react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import Hotkeys from "@/components/Hotkeys";
import WashoutCard from "@/components/WashoutCard";
import ForwardReturns from "@/components/ForwardReturns";
import EpisodeTable from "@/components/EpisodeTable";
import { Card } from "@/components/ui/card";
import { isCondition, type Condition } from "@/indicators/signals";
import { signalsData } from "@/query/signals";
import type { MaKind } from "@/query/breadth";
import IndexTabs from "@/components/IndexTabs";
import { UNTESTED_LINE } from "@/components/signals-copy";
import { NIFTY50, cleanIndex } from "@/ingest/indices";

export const dynamic = "force-dynamic";

// This page always uses the 200-day SMA (decision 0017). `ma` is only carried so
// the nav keeps the reader's choice on other pages. Every param is checked the
// same strict way as everywhere else (CLAUDE.md, sql.raw).
function isMaKind(v: string | undefined): v is MaKind {
  return v === "sma200" || v === "ema200" || v === "sma50";
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ma?: string; cond?: string; u?: string }>;
}) {
  const sp = await searchParams;
  const ma: MaKind = isMaKind(sp.ma) ? sp.ma : "sma200";
  const cond: Condition = isCondition(sp.cond) ? sp.cond : "under";
  const ix = cleanIndex(sp.u);
  // Only the NIFTY 50's alarm was tested (research 0001). Any other index shows its
  // washout episodes one by one: no medians, no "higher in x of y" (decision 0035).
  const tested = ix.key === NIFTY50.key;
  const s = await signalsData(ix);

  return (
    <AppShell current="signals" ma={ma} asOf={s.washout?.date}>
      <Hotkeys ma={ma} page="signals" />

      <PageHeader
        eyebrow={`${ix.label} · Research`}
        title="Signals"
        description={tested
          ? "What happened next. Index returns after breadth extremes, and the alarm that history supports."
          : `What happened next. Each time ${ix.label}'s breadth fell under 20%, and what the index did after.`}
        actions={<IndexTabs base="/signals" current={ix} ma={ma} extra={cond === "under" ? "" : `&cond=${cond}`} />}
      />

      {!s.washout || !s.first ? (
        <Card className="px-6 py-12 text-center">
          <p className="text-heading text-foreground">Nothing loaded yet</p>
          <p className="mt-2 text-body-sm text-foreground-2">
            Signals needs breadth and {ix.label} closes. Run{" "}
            <code className="rounded-sm bg-raised px-1.5 py-0.5 font-mono text-[12px]">bun run ingest:indices</code>{" "}
            and <code className="rounded-sm bg-raised px-1.5 py-0.5 font-mono text-[12px]">bun run indicators</code>.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-cards lg:grid-cols-12">
          <div className="reveal flex items-start gap-2.5 rounded-lg border bg-raised px-4 py-3 text-body-sm leading-5 text-foreground-2 lg:col-span-12">
            <Info className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
            {tested ? (
              <span>
                <strong className="font-medium text-foreground">History starts in {s.first.slice(0, 4)},</strong> on the
                index&apos;s real membership each day. That holds only a handful of washouts, so read the direction, not
                the decimals.
              </span>
            ) : (
              <span>
                <strong className="font-medium text-foreground">{UNTESTED_LINE}</strong> History starts in{" "}
                {s.first.slice(0, 4)}, on {ix.label}&apos;s real membership each day. Breadth counts every member once,
                but the index&apos;s close is driven by its two or three biggest members, so the two can disagree for weeks.
              </span>
            )}
          </div>
          <WashoutCard className="lg:col-span-12" washout={s.washout} recent={s.recent} first={s.first} indexLabel={ix.label} />
          {tested && <ForwardReturns
            className="lg:col-span-12"
            ma={ma}
            cond={cond}
            horizons={s.horizons[cond]}
            episodes={s.episodes[cond]}
            buckets={s.buckets}
          />}
          {/* another index: washout rows only (the over-80% side and every summary need the study it never had) */}
          <EpisodeTable
            className="lg:col-span-12"
            cond={tested ? cond : "under"}
            episodes={s.episodes[tested ? cond : "under"]}
            first={s.first}
            indexLabel={ix.label}
          />
        </div>
      )}
    </AppShell>
  );
}
