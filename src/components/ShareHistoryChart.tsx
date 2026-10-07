"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import { formatDate } from "@/lib/format";
import { useChartAnimation } from "@/lib/motion";
import type { HistoryPoint } from "@/query/money-flow";

const config = { sharePct: { label: "Share of all trading", color: "var(--chart-1)" } } satisfies ChartConfig;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const month = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`;

/**
 * The picked sector's weekly share of all trading: a second small panel under its trading-vs-normal line
 * (same weeks, same x axis), not a second axis on that chart. One series: no legend.
 */
export default function ShareHistoryChart({ data }: { data: HistoryPoint[] }) {
  const anim = useChartAnimation();
  const vals = data.map((d) => d.sharePct).filter((v): v is number => v !== null);
  const lo = Math.max(0, Math.floor(Math.min(...vals) - 0.5)), hi = Math.ceil(Math.max(...vals) + 0.5);
  const ticks = data.filter((d, i) => i === 0 || d.weekEnd.slice(0, 7) !== data[i - 1]!.weekEnd.slice(0, 7)).map((d) => d.weekEnd);
  return (
    <ChartContainer config={config} className="aspect-auto h-[calc(140px*var(--density-chart))] w-full">
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="weekEnd" ticks={ticks} tickFormatter={month} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis domain={[lo, hi]} tickCount={3} allowDecimals={false} tickFormatter={(v: number) => `${v}%`}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
        <ChartTooltip
          cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
          content={
            <ChartTooltipContent
              indicator="dot"
              labelFormatter={(_l, payload) => `Week to ${formatDate((payload?.[0]?.payload as HistoryPoint | undefined)?.weekEnd)}`}
              formatter={(value) => <span className="font-semibold tabular-nums text-foreground">{Number(value).toFixed(1)}% of all trading</span>}
            />
          }
        />
        <Line dataKey="sharePct" type="monotone" stroke="var(--chart-1)" strokeWidth={2} dot={false} connectNulls={false} {...anim}
          activeDot={{ r: 3, strokeWidth: 2, stroke: "var(--card)", fill: "var(--chart-1)" }} />
      </LineChart>
    </ChartContainer>
  );
}
