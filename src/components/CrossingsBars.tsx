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
 * straight across instead of being rotated. One series, so one colour: the
 * bars are not recoloured by value, their length already says it.
 */
export default function CrossingsBars({ data }: { data: BarDatum[] }) {
  const height = Math.max(160, data.length * 30 + 8);
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 0 }} barCategoryGap={8}>
        <CartesianGrid stroke="var(--grid-line)" horizontal={false} />
        <XAxis type="number" hide domain={[0, "dataMax"]} />
        <YAxis
          type="category"
          dataKey="symbol"
          interval={0}
          tick={{ fill: "var(--foreground-2)", fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={96}
        />
        <ChartTooltip
          cursor={{ fill: "var(--raised)" }}
          content={
            <ChartTooltipContent
              hideIndicator
              formatter={(value, _name, item) => {
                const d = item?.payload as BarDatum | undefined;
                return (
                  <div className="flex w-full items-center justify-between gap-4 tabular-nums">
                    <span className="text-muted-foreground">
                      {d?.avgRun ? `one every ${d.avgRun.toFixed(0)}d` : "crossings"}
                    </span>
                    <span className="font-semibold text-foreground">{value}</span>
                  </div>
                );
              }}
            />
          }
        />
        <Bar dataKey="crossings" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
          <LabelList
            dataKey="crossings"
            position="right"
            offset={8}
            className="fill-foreground-2 tabular-nums"
            fontSize={12}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
