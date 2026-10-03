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
  searchParams: Promise<{ ma?: string; cond?: string }>;
}) {
  const sp = await searchParams;
  const ma: MaKind = isMaKind(sp.ma) ? sp.ma : "sma200";
  const cond: Condition = isCondition(sp.cond) ? sp.cond : "under";
  const s = await signalsData();

  return (
    <AppShell current="signals" ma={ma} asOf={s.washout?.date}>
      <Hotkeys ma={ma} page="signals" />

      <PageHeader
        eyebrow="NIFTY 50 · Research"
        title="Signals"
        description="What happened next. Index returns after breadth extremes, and the alarm that history supports."
      />

      {!s.washout || !s.first ? (
        <Card className="px-6 py-12 text-center">
          <p className="text-heading text-foreground">Nothing loaded yet</p>
          <p className="mt-2 text-body-sm text-foreground-2">
            Signals needs breadth and NIFTY 50 closes. Run{" "}
            <code className="rounded-sm bg-raised px-1.5 py-0.5 font-mono text-[12px]">bun run ingest:indices</code>{" "}
            and <code className="rounded-sm bg-raised px-1.5 py-0.5 font-mono text-[12px]">bun run indicators</code>.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="reveal flex items-start gap-2.5 rounded-lg border bg-raised px-4 py-3 text-body-sm leading-5 text-foreground-2 lg:col-span-12">
            <Info className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
            <span>
              <strong className="font-medium text-foreground">History starts in {s.first.slice(0, 4)},</strong> on the
              index&apos;s real membership each day. That holds only a handful of washouts, so read the direction, not
              the decimals.
            </span>
          </div>
          <WashoutCard className="lg:col-span-12" washout={s.washout} recent={s.recent} first={s.first} />
          <ForwardReturns
            className="lg:col-span-12"
            ma={ma}
            cond={cond}
            horizons={s.horizons[cond]}
            episodes={s.episodes[cond]}
            buckets={s.buckets}
          />
          <EpisodeTable className="lg:col-span-12" cond={cond} episodes={s.episodes[cond]} first={s.first} />
        </div>
      )}
    </AppShell>
  );
}
