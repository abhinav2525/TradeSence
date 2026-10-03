import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Term from "@/components/Term";
import { pctText, toneClass } from "@/components/signals-copy";
import { HORIZONS } from "@/research/forward-returns";
import type { Condition, Episode } from "@/indicators/signals";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const head = "px-3 py-2 text-right text-[11px] font-medium uppercase tracking-[0.06em]";

/** Every episode of the selected condition, newest first, with the NIFTY 50's returns from its first day. */
export default function EpisodeTable({
  cond, episodes, first, className,
}: { cond: Condition; episodes: Episode[]; first: string; className?: string }) {
  const rows = [...episodes].reverse();
  const under = cond === "under";
  const name = under ? "under 20%" : "over 80%";
  return (
    <Card className={cn("flex flex-col", className)}>
      <div className="flex items-start justify-between gap-3 border-b px-5 py-3.5">
        <div>
          <h2 className="text-heading text-foreground"><Term id="episode">{`Episodes ${name}`}</Term></h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Most recent first, 200-day SMA</p>
        </div>
        <Badge variant="neutral">{rows.length} episode{rows.length === 1 ? "" : "s"}</Badge>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-body-sm text-muted-foreground">No episode {name} since {formatDate(first)}.</p>
      ) : (
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-body-sm tabular-nums">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b text-muted-foreground">
                <th className={cn(head, "pl-5 text-left")}>Started</th>
                <th className={head}>{under ? "Lowest" : "Highest"}</th>
                <th className={head}>{under ? "Sessions under" : "Sessions over"}</th>
                {HORIZONS.map((h) => (
                  <th key={h.key} className={cn(head, "last:pr-5")}>{h.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((e) => (
                <tr key={e.start}>
                  <td className="py-2 pl-5 pr-3 text-foreground">{formatDate(e.start)}</td>
                  <td className="px-3 py-2 text-right text-foreground-2">{e.extreme.toFixed(0)}%</td>
                  <td className="px-3 py-2 text-right text-foreground-2">{e.sessions}</td>
                  {HORIZONS.map((h) => {
                    const v = e.returns[h.key];
                    return (
                      <td key={h.key} className={cn("px-3 py-2 text-right last:pr-5", v === null ? "text-muted-foreground" : toneClass(v))}>
                        {v === null ? (e.pending[h.key] ? "Not yet" : "—") : pctText(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-auto border-t px-5 py-3 text-[12px] text-muted-foreground">
        An episode starts on the first close {name}; another within 10 sessions continues it. Returns run from the
        NIFTY 50&apos;s close on that first day. Not yet: that many sessions haven&apos;t passed. —: a gap in the data.
      </p>
    </Card>
  );
}
