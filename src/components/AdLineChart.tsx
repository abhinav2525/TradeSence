"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, XAxis, YAxis } from "recharts";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import { formatDate, signed } from "@/lib/format";
import { dateTicks } from "@/lib/ticks";
import { cn } from "@/lib/utils";
import Term from "@/components/Term";
import { useChartAnimation } from "@/lib/motion";
import SlidingPill from "@/components/SlidingPill";

export type NetPoint = { date: string; net: number };
type LinePoint = NetPoint & { line: number };

const config = { line: { label: "A/D line", color: "var(--chart-1)" } } satisfies ChartConfig;

const RANGES = [
  { key: "3m", label: "3M", sessions: 63 },
  { key: "6m", label: "6M", sessions: 126 },
  { key: "1y", label: "1Y", sessions: 250 },
  { key: "all", label: "All", sessions: Infinity },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

/**
 * The A/D line: net advances added up over the visible window, starting from
 * zero at its first session. The level is arbitrary; the slope is the reading.
 */
export default function AdLineChart({ data, selectedDate }: { data: NetPoint[]; selectedDate?: string | null }) {
  const anim = useChartAnimation();
  const [range, setRange] = useState<RangeKey>("1y");

  const visible: LinePoint[] = useMemo(() => {
    const n = RANGES.find((r) => r.key === range)!.sessions;
    let sliced = n === Infinity ? data : data.slice(-n);
    if (selectedDate && sliced.length && sliced[0]!.date > selectedDate) sliced = data;
    let line = 0;
    return sliced.map((p) => ({ ...p, line: (line += p.net) }));
  }, [data, range, selectedDate]);

  const high = visible.reduce<LinePoint | undefined>((a, p) => (!a || p.line > a.line ? p : a), undefined);
  const last = visible.at(-1);
  const selected = selectedDate ? visible.find((p) => p.date === selectedDate) : undefined;
  const axis = useMemo(() => dateTicks(visible.map((p) => p.date), 7), [visible]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-2 pt-4">
        <div>
          <h2 className="text-heading text-foreground"><Term id="ad-line">Advance/decline line</Term></h2>
          <p className="mt-0.5 text-[12px] tabular-nums text-muted-foreground">
            {visible[0] ? `Cumulative net advances, ${formatDate(visible[0].date)} – ${formatDate(last!.date)}` : "No sessions"}
          </p>
        </div>
        <div className="seg relative inline-flex items-center gap-0.5 rounded-md border bg-raised p-0.5" role="group" aria-label="Time range">
          <SlidingPill active={range} />
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              aria-pressed={range === r.key}
              className={cn(
                "h-7 rounded-[8px] px-2.5 text-[12px] font-medium tabular-nums transition-colors",
                range === r.key ? "bg-thumb text-foreground shadow-thumb" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <ChartContainer config={config} className="aspect-auto h-[260px] w-full px-2 pb-3">
        <LineChart data={visible} margin={{ top: 24, right: 24, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid-line)" vertical={false} />
          <XAxis
            dataKey="date"
            ticks={axis.ticks}
            tickFormatter={axis.label}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(v: number) => signed(v)}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <ReferenceLine y={0} stroke="var(--border-strong)" />
          {selectedDate && <ReferenceLine x={selectedDate} stroke="var(--foreground)" strokeOpacity={0.35} />}
          <ChartTooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
            content={
              <ChartTooltipContent
                indicator="dot"
                labelFormatter={(_l, payload) => {
                  const p = payload?.[0]?.payload as LinePoint | undefined;
                  return p ? formatDate(p.date) : "";
                }}
                formatter={(_v, _n, item) => {
                  const p = item?.payload as LinePoint | undefined;
                  return (
                    <div className="flex w-full items-center justify-between gap-4 tabular-nums">
                      <span className="text-muted-foreground">Net {p ? signed(p.net) : ""}</span>
                      <span className="font-semibold text-foreground">{p ? signed(p.line) : ""}</span>
                    </div>
                  );
                }}
              />
            }
          />
          <Line
            dataKey="line"
            type="monotone"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={false}
            {...anim}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: "var(--chart-1)" }}
          />
          {high && high !== last && (
            <ReferenceDot
              x={high.date}
              y={high.line}
              r={4}
              fill="var(--chart-1)"
              stroke="var(--card)"
              strokeWidth={2}
              label={{ value: `High ${signed(high.line)}, ${formatDate(high.date)}`, position: "top", fill: "var(--foreground-2)", fontSize: 11 }}
            />
          )}
          {(selected ?? last) && (
            <ReferenceDot
              x={(selected ?? last)!.date}
              y={(selected ?? last)!.line}
              r={5}
              fill="var(--chart-1)"
              stroke="var(--card)"
              strokeWidth={2}
            />
          )}
        </LineChart>
      </ChartContainer>
    </div>
  );
}
