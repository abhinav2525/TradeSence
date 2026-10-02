"use client";

import { useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceDot, ReferenceLine, XAxis, YAxis,
} from "recharts";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import { formatDate, formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";

export type AreaPoint = { date: string; pct: number; above: number; total: number };

const config = {
  pct: { label: "Share above the average", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** Trading sessions per window. ~250 sessions to the year on the NSE. */
const RANGES = [
  { key: "1y", label: "1Y", sessions: 250 },
  { key: "3y", label: "3Y", sessions: 750 },
  { key: "5y", label: "5Y", sessions: 1250 },
  { key: "all", label: "All", sessions: Infinity },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

type Props = { data: AreaPoint[]; selectedDate?: string | null };

/**
 * Breadth since 2020: one series, so no legend (the heading names it).
 * The bands under 20% and over 80% mark the extremes the percentile is about.
 */
export default function BreadthArea({ data, selectedDate }: Props) {
  const [range, setRange] = useState<RangeKey>("all");

  const visible = useMemo(() => {
    const n = RANGES.find((r) => r.key === range)!.sessions;
    const sliced = n === Infinity ? data : data.slice(-n);
    // A selected session outside the window would leave its marker invisible,
    // so widen back to everything rather than lie about where you are.
    if (selectedDate && sliced.length && sliced[0]!.date > selectedDate) return data;
    return sliced;
  }, [data, range, selectedDate]);

  const ticks = useMemo(() => axisTicks(visible), [visible]);
  const granular = visible.length <= 400;
  const selected = selectedDate ? visible.find((p) => p.date === selectedDate) : undefined;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-2 pt-4">
        <div>
          <h2 className="text-heading text-foreground">Breadth over time</h2>
          <p className="mt-0.5 text-[12px] tabular-nums text-muted-foreground">
            {visible[0] ? `${formatDate(visible[0].date)} – ${formatDate(visible.at(-1)!.date)}` : "No sessions"}
          </p>
        </div>
        <div className="inline-flex items-center gap-0.5 rounded-md border bg-raised p-0.5" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              aria-pressed={range === r.key}
              className={cn(
                "h-7 rounded-[8px] px-2.5 text-[12px] font-medium tabular-nums transition-colors",
                range === r.key
                  ? "bg-thumb text-foreground shadow-thumb"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <ChartContainer config={config} className="aspect-auto h-[300px] w-full px-2 pb-3">
        <AreaChart data={visible} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="breadthFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.32} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <ReferenceArea y1={80} y2={100} fill="var(--up)" fillOpacity={0.06} stroke="none" ifOverflow="hidden" />
          <ReferenceArea y1={0} y2={20} fill="var(--down)" fillOpacity={0.07} stroke="none" ifOverflow="hidden" />
          <CartesianGrid stroke="var(--grid-line)" vertical={false} />
          <XAxis
            dataKey="date"
            ticks={ticks}
            tickFormatter={(d: string) => (granular ? formatMonth(d) : d.slice(0, 4))}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 20, 50, 80, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <ReferenceLine y={50} stroke="var(--border-strong)" />
          {selectedDate && (
            <ReferenceLine x={selectedDate} stroke="var(--foreground)" strokeOpacity={0.35} />
          )}
          <ChartTooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
            content={
              <ChartTooltipContent
                // "dot" keeps the date as the tooltip's heading; a custom
                // formatter replaces the indicator itself
                indicator="dot"
                labelFormatter={(_l, payload) => {
                  const p = payload?.[0]?.payload as AreaPoint | undefined;
                  return p ? formatDate(p.date) : "";
                }}
                formatter={(value, _name, item) => {
                  const p = item?.payload as AreaPoint | undefined;
                  return (
                    <div className="flex w-full items-center justify-between gap-4 tabular-nums">
                      <span className="text-muted-foreground">
                        {p?.above} of {p?.total} above
                      </span>
                      <span className="font-semibold text-foreground">{Number(value).toFixed(1)}%</span>
                    </div>
                  );
                }}
              />
            }
          />
          <Area
            dataKey="pct"
            type="monotone"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#breadthFill)"
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: "var(--chart-1)" }}
          />
          {selected && (
            <ReferenceDot
              x={selected.date}
              y={selected.pct}
              r={5}
              fill="var(--chart-1)"
              stroke="var(--card)"
              strokeWidth={2}
            />
          )}
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

/** About a dozen ticks, whatever the window — never 2,500 measured candidates. */
function axisTicks(data: AreaPoint[]): string[] {
  if (data.length === 0) return [];
  if (data.length > 400) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const d of data) {
      const y = d.date.slice(0, 4);
      if (!seen.has(y)) { seen.add(y); out.push(d.date); }
    }
    return out;
  }
  const step = Math.max(1, Math.ceil(data.length / 8));
  return data.filter((_, i) => i % step === 0).map((d) => d.date);
}
