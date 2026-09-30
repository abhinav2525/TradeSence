"use client";

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";

export type BarDatum = { symbol: string; crossings: number; avgRun: number | null };

const config = {
  crossings: { label: "Crossings", color: "var(--chart-1)" },
} satisfies ChartConfig;

/**
 * The busiest crossers as a horizontal bar chart.
 *
 * Horizontal because the category labels are ticker symbols — they read
 * straight across instead of being rotated, which is the usual reason a
 * vertical bar chart of named things is hard to scan.
 */
export default function CrossingsBars({ data }: { data: BarDatum[] }) {
  return (
    <ChartContainer config={config} className="h-[260px] w-full">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, bottom: 0, left: 4 }}>
        <CartesianGrid stroke="var(--grid-line)" horizontal={false} />
        <XAxis type="number" hide domain={[0, "dataMax"]} />
        <YAxis
          type="category"
          dataKey="symbol"
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={92}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          content={
            <ChartTooltipContent
              hideLabel={false}
              formatter={(value, _name, item) => {
                const d = item?.payload as BarDatum | undefined;
                return (
                  <span className="font-mono text-xs">
                    {value} crossings
                    {d?.avgRun ? ` — one every ${d.avgRun.toFixed(0)}d` : ""}
                  </span>
                );
              }}
            />
          }
        />
        <Bar dataKey="crossings" fill="var(--chart-1)" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          <LabelList
            dataKey="crossings"
            position="right"
            className="fill-muted-foreground"
            fontSize={11}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
