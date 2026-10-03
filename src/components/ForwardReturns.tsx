import Link from "next/link";
import { Card } from "@/components/ui/card";
import Term from "@/components/Term";
import SlidingPill from "@/components/SlidingPill";
import ReturnBuckets from "@/components/ReturnBuckets";
import { pctText, readingSentence, toneClass } from "@/components/signals-copy";
import type { BucketMedian, Condition, Episode, HorizonSummary } from "@/indicators/signals";
import { cn } from "@/lib/utils";

const OPTIONS: { key: Condition; label: string }[] = [
  { key: "under", label: "Under 20%" },
  { key: "over", label: "Over 80%" },
];
const head = "px-3 py-2 text-right text-[11px] font-medium uppercase tracking-[0.06em]";
const seg = (on: boolean) =>
  cn(
    "inline-flex h-8 items-center rounded-[8px] px-3 text-body-sm font-medium transition-colors",
    on ? "bg-thumb text-foreground shadow-thumb" : "text-muted-foreground hover:text-foreground",
  );

type Props = {
  ma: string;
  cond: Condition;
  horizons: HorizonSummary[];
  episodes: Episode[];
  buckets: { buckets: BucketMedian[]; all: number | null };
  className?: string;
};

/** What the NIFTY 50 did after each episode, against an ordinary day, and by breadth level. */
export default function ForwardReturns({ ma, cond, horizons, episodes, buckets, className }: Props) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-4">
        <div>
          <h2 className="text-heading text-foreground"><Term id="forward-return">What happened next</Term></h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            NIFTY 50, from the first session of each {cond === "under" ? "washout" : "over-80% episode"}
          </p>
        </div>
        <div className="seg relative inline-flex items-center gap-0.5 rounded-md border bg-raised p-0.5" role="tablist" aria-label="Breadth condition">
          <SlidingPill active={cond} />
          {OPTIONS.map((o) => (
            <Link key={o.key} href={`/signals?ma=${ma}&cond=${o.key}`} scroll={false} role="tab" aria-selected={cond === o.key} className={seg(cond === o.key)}>
              {o.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-6 px-5 pb-5 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-body-sm tabular-nums">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className={cn(head, "pl-4 text-left")}>Horizon</th>
                  <th className={head}>Median</th>
                  <th className={head}>Higher</th>
                  <th className={head}>Best</th>
                  <th className={head}>Worst</th>
                  <th className={cn(head, "pr-4")}>Any day</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {horizons.map((h) => (
                  <tr key={h.key}>
                    <td className="py-2 pl-4 pr-3 text-foreground">{h.label}</td>
                    <td className={cn("px-3 py-2 text-right font-semibold", toneClass(h.median))}>{pctText(h.median)}</td>
                    <td className="px-3 py-2 text-right text-foreground-2">{h.n === 0 ? "—" : `${h.higher} of ${h.n}`}</td>
                    <td className={cn("px-3 py-2 text-right", toneClass(h.best))}>{pctText(h.best)}</td>
                    <td className={cn("px-3 py-2 text-right", toneClass(h.worst))}>{pctText(h.worst)}</td>
                    <td className="py-2 pl-3 pr-4 text-right text-foreground-2">{pctText(h.baseline)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-body-sm leading-5 text-foreground-2">{readingSentence(cond, horizons, episodes)}</p>
        </div>

        <div className="min-w-0">
          <p className="mb-2 text-[12px] font-medium text-muted-foreground">Median 3-month return, by breadth on the day</p>
          <ReturnBuckets
            data={buckets.buckets.map((b) => ({ bucket: b.bucket, n: b.n, median: b.median === null ? null : Math.round(b.median * 10) / 10 }))}
            all={buckets.all === null ? null : Math.round(buckets.all * 10) / 10}
            highlight={cond === "under" ? "<20" : "≥80"}
          />
          <p className="mt-2 text-[12px] leading-4 text-muted-foreground">
            Dashed line: any day, {pctText(buckets.all)}. Counted by session: neighbouring days overlap, so the
            episodes are the honest count.
          </p>
        </div>
      </div>
    </Card>
  );
}
