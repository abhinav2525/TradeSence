import { Card } from "@/components/ui/card";
import { formatDate, formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import Term from "@/components/Term";

export type Bin = { from: number; to: number; count: number };

type Props = {
  pct: number;
  above: number;
  total: number;
  maLabel: string;
  date: string;
  percentile: number;
  bins: Bin[];
  current: number;
  sessions: number;
  className?: string;
};

/**
 * The headline: today's share in big type, the above/below split, and where
 * today sits among every session since 2020. The distribution replaces a dial: it
 * shows the same position and also how unusual that position is.
 */
export default function BreadthHero({
  pct, above, total, maLabel, date, percentile, bins, current, sessions, className,
}: Props) {
  const below = total - above;
  const max = Math.max(...bins.map((b) => b.count), 1);
  const rarity =
    percentile <= 50
      ? `Only ${percentile.toFixed(1)}% of sessions closed this weak or weaker.`
      : `Only ${(100 - percentile).toFixed(1)}% of sessions closed this strong or stronger.`;

  return (
    <Card className={cn("flex flex-col gap-6 p-5 sm:p-6 md:flex-row", className)}>
      <div className="flex flex-col md:w-[44%]">
        <p className="text-eyebrow uppercase text-muted-foreground"><Term id="breadth" today={`${pct.toFixed(0)}%`}>Above the {maLabel}</Term></p>
        <p className="mt-4 text-display text-foreground">
          {pct.toFixed(0)}
          <span className="ml-1 text-[0.45em] font-medium tracking-normal text-muted-foreground">%</span>
        </p>
        <p className="mt-3 text-[13px] leading-5 text-foreground-2">
          of NIFTY 50 constituents closed above their {maLabel} on{" "}
          <time dateTime={date} className="font-medium text-foreground">
            {formatDate(date)}
          </time>
          .
        </p>

        <div className="mt-auto pt-6">
          {/* two fills with a 2px surface gap, so the split reads without a stroke */}
          <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
            {above > 0 && <div className="h-full rounded-l-full bg-up" style={{ width: `${(above / total) * 100}%` }} />}
            {below > 0 && <div className="h-full flex-1 rounded-r-full bg-down" />}
          </div>
          <div className="mt-2 flex justify-between text-[12px] tabular-nums">
            <span className="text-foreground-2">
              <span className="font-semibold text-up">▲ {above}</span> above
            </span>
            <span className="text-foreground-2">
              below <span className="font-semibold text-down">{below} ▼</span>
            </span>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col md:border-l md:pl-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-heading text-foreground"><Term id="percentile" today={percentile.toFixed(1)}>Where today sits</Term></h2>
          <span className="text-[12px] tabular-nums text-muted-foreground">{formatInt(sessions)} sessions</span>
        </div>
        <p className="mt-1 text-[12px] leading-4 text-foreground-2">{rarity}</p>

        <div
          className="relative mt-auto flex h-32 items-end gap-0.5 pt-8"
          role="img"
          aria-label={`Distribution of daily breadth over ${sessions} sessions. Today, ${pct.toFixed(0)}%, is at the ${percentile.toFixed(0)}th percentile.`}
        >
          {bins.map((b, i) => (
            <div key={b.from} className="group relative flex h-full flex-1 items-end">
              <div
                className={cn(
                  "w-full rounded-t-[3px] transition-colors",
                  i === current ? "bg-brand" : "bg-chart-muted group-hover:bg-foreground/25",
                )}
                style={{ height: `${b.count ? Math.max(4, (b.count / max) * 100) : 0}%` }}
              />
              {i === current && (
                <span className="absolute -top-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-brand px-1.5 py-px text-[10px] font-semibold text-brand-foreground">
                  Today
                </span>
              )}
              {/* edge bins anchor their tooltip inward so it never pokes past the card */}
              <span
                className={cn(
                  "pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-[11px] tabular-nums text-popover-foreground shadow-pop group-hover:block",
                  i < 4 ? "left-0" : i > 15 ? "right-0" : "left-1/2 -translate-x-1/2",
                )}
              >
                {b.from}–{b.to}%: {formatInt(b.count)} sessions
              </span>
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-muted-foreground">
          <span>0%</span>
          <span>25%</span>
          <span>50%</span>
          <span>75%</span>
          <span>100%</span>
        </div>
      </div>
    </Card>
  );
}
