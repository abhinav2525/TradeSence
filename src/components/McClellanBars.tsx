"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from "recharts";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import { formatDate, signed } from "@/lib/format";
import { dateTicks } from "@/lib/ticks";

export type OscPoint = { date: string; value: number };

const config = { value: { label: "McClellan", color: "var(--chart-1)" } } satisfies ChartConfig;

/**
 * McClellan oscillator as bars. Here colour carries meaning (above or below
 * zero), so unlike the single-series charts this one has a legend.
 */
export default function McClellanBars({ data }: { data: OscPoint[] }) {
  const axis = dateTicks(data.map((p) => p.date), 6);
  // Round steps that always include zero, so an all-negative stretch still
  // reads as below the line and the ticks are numbers a person would pick.
  const values = data.map((p) => p.value);
  const span = Math.max(...values.map(Math.abs), 1);
  const step = [10, 25, 50, 100, 200, 500].find((s) => span / s <= 4) ?? 1000;
  const lo = Math.min(0, Math.floor(Math.min(...values, 0) / step) * step);
  const hi = Math.max(0, Math.ceil(Math.max(...values, 0) / step) * step);
  const yTicks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-2 pt-4">
        <div>
          <h2 className="text-heading text-foreground">McClellan oscillator</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Last {data.length} sessions, ratio-adjusted</p>
        </div>
        <div className="flex items-center gap-4 text-[12px] text-foreground-2">
          <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-up" aria-hidden="true" />Above zero</span>
          <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-down" aria-hidden="true" />Below zero</span>
        </div>
      </div>
      <ChartContainer config={config} className="aspect-auto h-[230px] w-full px-2 pb-3">
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} barCategoryGap={1}>
          <CartesianGrid stroke="var(--grid-line)" vertical={false} />
          <XAxis
            dataKey="date"
            ticks={axis.ticks}
            tickFormatter={axis.label}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />
          <YAxis
            domain={[lo, hi]}
            ticks={yTicks}
            tickFormatter={(v: number) => signed(v)}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <ReferenceLine y={0} stroke="var(--border-strong)" />
          <ChartTooltip
            cursor={{ fill: "var(--raised)" }}
            content={
              <ChartTooltipContent
                indicator="dot"
                labelFormatter={(_l, payload) => {
                  const p = payload?.[0]?.payload as OscPoint | undefined;
                  return p ? formatDate(p.date) : "";
                }}
                formatter={(v) => (
                  <div className="flex w-full items-center justify-between gap-4 tabular-nums">
                    <span className="text-muted-foreground">{Number(v) >= 0 ? "Above zero" : "Below zero"}</span>
                    <span className="font-semibold text-foreground">{signed(Number(v), 1)}</span>
                  </div>
                )}
              />
            }
          />
          <Bar dataKey="value" maxBarSize={18} isAnimationActive={false}>
            {data.map((p) => (
              <Cell key={p.date} fill={p.value >= 0 ? "var(--up)" : "var(--down)"} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}
