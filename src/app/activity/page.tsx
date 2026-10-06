import Link from "next/link";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import DateNav from "@/components/DateNav";
import Hotkeys from "@/components/Hotkeys";
import SlidingPill from "@/components/SlidingPill";
import Term from "@/components/Term";
import ActivityTable, { KIND_LABEL } from "@/components/ActivityTable";
import { Badge } from "@/components/ui/badge";
import { Card, CardFooter } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { KINDS, type Kind } from "@/indicators/activity";
import type { MaKind } from "@/query/breadth";
import {
  activityFirst, activityNeighbours, activityOn, activitySession, cleanActivitySet, filterBigJumps, filterKinds, kindCounts, type ActivitySet,
} from "@/query/activity";
import { INDICES, NIFTY50, indexByKey, indexLabels } from "@/ingest/indices";

export const dynamic = "force-dynamic";

// Every search param is checked with strict comparisons and falls back to its
// default (CLAUDE.md): nothing from the URL reaches SQL except a checked date.
function isMaKind(v: string | undefined): v is MaKind {
  return v === "sma200" || v === "ema200" || v === "sma50";
}
function isKind(v: string): v is Kind {
  return v === "kept" || v === "volume" || v === "jump" || v === "collapse";
}
function cleanKinds(v: string | undefined): Kind[] {
  const picked = (v ?? "").split(",").filter(isKind);
  return picked.length ? KINDS.filter((k) => picked.includes(k)) : [...KINDS];
}
type Move = "all" | "big";
function isMove(v: string | undefined): v is Move {
  return v === "all" || v === "big";
}
function cleanDate(v: string | undefined): string | undefined {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}
const seg = (on: boolean) =>
  cn(
    "inline-flex h-8 items-center gap-2 rounded-[8px] px-3 text-body-sm font-medium transition-colors",
    on ? "bg-thumb text-foreground shadow-thumb" : "text-muted-foreground hover:text-foreground",
  );

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ma?: string; date?: string; set?: string; kinds?: string; move?: string }>;
}) {
  const sp = await searchParams;
  const ma: MaKind = isMaKind(sp.ma) ? sp.ma : "sma200";
  const set: ActivitySet = cleanActivitySet(sp.set);
  const kinds = cleanKinds(sp.kinds);
  const move: Move = isMove(sp.move) ? sp.move : "all";
  const wanted = cleanDate(sp.date);

  const date = await activitySession(wanted);
  const latest = await activitySession();
  const first = await activityFirst();
  const nav = date ? await activityNeighbours(date) : { prev: null, next: null };
  const all = date ? await activityOn(date, set) : [];
  const counts = kindCounts(all);
  const byKind = filterKinds(all, kinds);
  const bigJumps = filterBigJumps(byKind).length;
  const shown = move === "big" ? filterBigJumps(byKind) : byKind;

  const extra = (p: { set?: ActivitySet; kinds?: Kind[]; move?: Move } = {}) =>
    `&set=${p.set ?? set}&kinds=${(p.kinds ?? kinds).join(",")}${(p.move ?? move) === "big" ? "&move=big" : ""}`;
  const href = (p: { set?: ActivitySet; kinds?: Kind[]; move?: Move }) =>
    `/activity?ma=${ma}${date && wanted ? `&date=${date}` : ""}${extra(p)}`;
  const toggle = (k: Kind) => {
    const next = kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k];
    return href({ kinds: next.length ? KINDS.filter((x) => next.includes(x)) : [...KINDS] });
  };
  // A registered index: its members on that date (decisions 0034, 0037), like the NIFTY 50 switch.
  const ix = set === "all" ? undefined : indexByKey(set);
  const scope = ix ? `${ix.label} members` : "active stocks";
  const scopeOf = (n: number) => (n !== 1 ? scope : ix ? `${ix.label} member` : "active stock");

  return (
    <AppShell current="activity" ma={ma} asOf={latest}>
      <Hotkeys ma={ma} prev={nav.prev} next={nav.next} page="activity" extra={extra()} />
      <PageHeader
        eyebrow="All NSE · Stocks"
        title="Unusual activity"
        description="Stocks whose session was far outside their own normal: shares kept, shares traded, or the share kept. Facts about the day, not predictions."
        actions={
          <DateNav
            base="/activity"
            extra={extra()}
            ma={ma}
            date={date}
            requested={wanted ?? null}
            snapped={Boolean(wanted && date && date !== wanted)}
            prev={nav.prev}
            next={nav.next}
            min={first}
            max={latest}
          />
        }
      />

      {!date ? (
        <Card className="px-6 py-12 text-center">
          {first && wanted && wanted < first ? (
            <>
              <p className="text-heading text-foreground">Unusual activity starts on {formatDate(first)}</p>
              <p className="mt-2 text-body-sm text-foreground-2">
                Each stock needs 20 sessions of history before a day can count as unusual.{" "}
                <Link href={`/activity?ma=${ma}&date=${first}${extra()}`} className="font-medium text-brand hover:underline">Go to the first session</Link>
              </p>
            </>
          ) : (
            <>
              <p className="text-heading text-foreground">Nothing loaded for that session</p>
              <p className="mt-2 text-body-sm text-foreground-2">
                Run <code className="rounded-sm bg-raised px-1.5 py-0.5 font-mono text-[12px]">bun run activity</code>.
              </p>
            </>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-card-x py-3">
            <div className="seg relative inline-flex items-center gap-0.5 rounded-md border bg-raised p-0.5" role="tablist" aria-label="Stocks">
              <SlidingPill active={set} />
              {([["all", "All active stocks"], ...INDICES.map((x) => [x.key, x.label] as const)] as const).map(([k, text]) => (
                <Link key={k} href={href({ set: k })} role="tab" aria-selected={set === k} className={seg(set === k)}>{text}</Link>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Kinds">
              {KINDS.map((k) => (
                <Link key={k} href={toggle(k)} aria-pressed={kinds.includes(k)}
                  className={cn("inline-flex h-7 items-center gap-1.5 rounded-[8px] border px-2.5 text-[12px] font-medium transition-colors",
                    kinds.includes(k) ? "bg-thumb text-foreground shadow-thumb" : "text-muted-foreground hover:text-foreground")}>
                  {KIND_LABEL[k]}
                  <span className="font-mono text-[11px]">{counts[k]}</span>
                </Link>
              ))}
              <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
              <Link href={href({ move: move === "big" ? "all" : "big" })} aria-pressed={move === "big"}
                className={cn("inline-flex h-7 items-center gap-1.5 rounded-[8px] border px-2.5 text-[12px] font-medium transition-colors",
                  move === "big" ? "bg-thumb text-foreground shadow-thumb" : "text-muted-foreground hover:text-foreground")}>
                Big price jumps only
                <span className="font-mono text-[11px]">{bigJumps}</span>
              </Link>
            </div>
          </div>

          <div className="flex items-start justify-between gap-3 px-card-x pb-2 pt-4">
            <div>
              <h2 className="text-heading text-foreground">
                {all.length} {scopeOf(all.length)} had an <Term id="unusual-activity">unusual day</Term> on {formatDate(date)}
              </h2>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Sorted by how far outside normal, against each stock&apos;s own last 20 sessions. Our research found big delivery days don&apos;t reliably lead to gains (<Link href="/learn/unusual-activity" className="text-brand hover:underline">why</Link>), and that huge volume on an up day is not a warning by itself: the size of the jump matters more (<Link href="/learn/big-price-jump" className="text-brand hover:underline">big price jump</Link>).
              </p>
            </div>
            <Badge variant="neutral">{shown.length} {shown.length === 1 ? "stock" : "stocks"}</Badge>
          </div>

          <ActivityTable
            rows={shown}
            empty={all.length === 0 ? `No ${scope} had an unusual day on ${formatDate(date)}.` : "No stock matched these filters."}
          />
          <CardFooter>
            Each stock against its own last 20 sessions; stocks trading under ₹1 crore a day and ETFs are left out.
            Report Cards cover stocks that have been in the {indexLabels()} since 2020; those link to theirs.
            {ix && ix !== NIFTY50 && ` ${ix.label} counts each stock only on the days it was in the index.`}
          </CardFooter>
        </Card>
      )}
    </AppShell>
  );
}
