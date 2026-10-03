"use client";

import { Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import { formatDate } from "@/lib/format";
import { useChartAnimation } from "@/lib/motion";

export type SparkPoint = { date: string; pct: number };

const config = { pct: { label: "Share above the 200-day SMA", color: "var(--chart-1)" } } satisfies ChartConfig;

/** The detector's recent breadth with its threshold. One series: no legend. */
export default function WashoutSpark({ data, line }: { data: SparkPoint[]; line: number }) {
  const anim = useChartAnimation();
  const top = Math.max(50, Math.ceil(Math.max(...data.map((d) => d.pct), 0) / 10) * 10);
  return (
    <ChartContainer config={config} className="aspect-auto h-[140px] w-full">
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <XAxis dataKey="date" hide />
        <YAxis
          domain={[0, top]}
          ticks={[0, line, top]}
          tickFormatter={(v: number) => `${v}%`}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={36}
        />
        <ReferenceLine y={line} stroke="var(--down)" strokeDasharray="4 4" />
        <ChartTooltip
          cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
          content={
            <ChartTooltipContent
              indicator="dot"
              labelFormatter={(_l, payload) => formatDate((payload?.[0]?.payload as SparkPoint | undefined)?.date)}
              formatter={(value) => (
                <span className="font-semibold tabular-nums text-foreground">{Number(value).toFixed(0)}% above</span>
              )}
            />
          }
        />
        <Line
          dataKey="pct"
          type="monotone"
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={false}
          {...anim}
          activeDot={{ r: 3, strokeWidth: 2, stroke: "var(--card)", fill: "var(--chart-1)" }}
        />
      </LineChart>
    </ChartContainer>
  );
}
