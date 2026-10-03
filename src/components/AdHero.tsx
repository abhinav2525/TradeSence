import { Card } from "@/components/ui/card";
import { formatDate, formatDayMonth, signed } from "@/lib/format";
import { cn } from "@/lib/utils";
import Term from "@/components/Term";
import CountUp from "@/components/CountUp";

export type NetBar = { date: string; advancing: number; declining: number; net: number };

type Props = {
  date: string;
  advancing: number;
  declining: number;
  unchanged: number;
  net: number;
  recent: NetBar[]; // oldest first, ending on `date`
  className?: string;
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Consecutive sessions, ending today, whose net had the same sign as today's. */
function streak(bars: NetBar[]): number {
  const sign = Math.sign(bars.at(-1)?.net ?? 0);
  if (sign === 0) return 0;
  let n = 0;
  for (let i = bars.length - 1; i >= 0 && Math.sign(bars[i]!.net) === sign; i--) n++;
  return n;
}

/**
 * The headline: net advances in big type, the rose / flat / fell split, and
 * the last 20 sessions as diverging bars, so one day is read against its run.
 */
export default function AdHero({ date, advancing, declining, unchanged, net, recent, className }: Props) {
  const total = advancing + declining + unchanged || 1;
  const max = Math.max(...recent.map((b) => Math.abs(b.net)), 1);
  const up = recent.filter((b) => b.net > 0).length;
  const run = streak(recent);
  const runText =
    run >= 3 ? ` ${run} straight ${net > 0 ? "advancing" : "declining"} sessions to ${formatDate(date)}.` : "";

  return (
    <Card className={cn("flex flex-col gap-6 px-card-x py-card sm:comfortable:p-6 md:flex-row", className)}>
      <div className="flex flex-col md:w-[44%]">
        <p className="text-eyebrow uppercase text-muted-foreground"><Term id="net-advances" today={`${signed(net)} (${advancing} rose, ${declining} fell)`}>Net advances</Term></p>
        <p className="mt-4 text-display tabular-nums text-foreground"><CountUp text={signed(net)} /></p>
        <p className="mt-3 text-body-sm leading-5 text-foreground-2">
          {advancing} {plural(advancing, "constituent", "constituents")} rose, {declining} fell
          {unchanged > 0 ? ` and ${unchanged} closed unchanged` : ""} on{" "}
          <time dateTime={date} className="font-medium text-foreground">
            {formatDate(date)}
          </time>
          .
        </p>

        <div className="mt-auto pt-6">
          {/* three fills with 2px surface gaps, so the split reads without strokes */}
          <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
            {advancing > 0 && <div className="grow-x h-full bg-up" style={{ width: `${(advancing / total) * 100}%` }} />}
            {unchanged > 0 && <div className="grow-x h-full bg-chart-muted" style={{ width: `${(unchanged / total) * 100}%` }} />}
            {declining > 0 && <div className="h-full flex-1 bg-down" />}
          </div>
          <div className="mt-2 flex justify-between text-[12px] tabular-nums text-foreground-2">
            <span>
              <span className="font-semibold text-up">▲ {advancing}</span> rose
            </span>
            <span>{unchanged} flat</span>
            <span>
              fell <span className="font-semibold text-down">{declining} ▼</span>
            </span>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col md:border-l md:pl-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-heading text-foreground"><Term id="advancers-decliners">Last {recent.length} sessions</Term></h2>
          <span className="text-[12px] tabular-nums text-muted-foreground">
            {up} of {recent.length} advancing
          </span>
        </div>
        <p className="mt-1 text-[12px] leading-4 text-foreground-2">Net advances per session.{runText}</p>

        <div
          className="relative mt-auto flex h-28 items-stretch gap-0.5 pt-4"
          role="img"
          aria-label={`Net advances for the last ${recent.length} sessions to ${formatDate(date)}: ${up} advancing, ${recent.filter((b) => b.net < 0).length} declining.`}
        >
          <div className="pointer-events-none absolute inset-x-0 top-[calc(50%+8px)] h-px bg-border-strong" aria-hidden="true" />
          {recent.map((b, i) => (
            <div key={b.date} className="group relative flex flex-1 flex-col">
              <div className="flex flex-1 items-end">
                {b.net > 0 && (
                  <div className="grow-y w-full rounded-t-[3px] bg-up" style={{ height: `${Math.max(4, (b.net / max) * 100)}%` }} />
                )}
              </div>
              <div className="flex flex-1 items-start">
                {b.net < 0 && (
                  <div className="grow-y-top w-full rounded-b-[3px] bg-down" style={{ height: `${Math.max(4, (-b.net / max) * 100)}%` }} />
                )}
              </div>
              <span
                className={cn(
                  "pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-[11px] tabular-nums text-popover-foreground shadow-pop group-hover:block",
                  i < 4 ? "left-0" : i > recent.length - 5 ? "right-0" : "left-1/2 -translate-x-1/2",
                )}
              >
                {formatDate(b.date)}: {b.advancing} rose, {b.declining} fell ({signed(b.net)})
              </span>
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-muted-foreground">
          <span>{recent[0] ? formatDayMonth(recent[0].date) : ""}</span>
          <span>{recent.length > 2 ? formatDayMonth(recent[Math.floor(recent.length / 2)]!.date) : ""}</span>
          <span>{formatDayMonth(date)}</span>
        </div>
      </div>
    </Card>
  );
}
