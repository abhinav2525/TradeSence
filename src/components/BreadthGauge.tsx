"use client";

import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

const config = {
  pct: { label: "Above the average", color: "var(--chart-1)" },
} satisfies ChartConfig;

type Props = {
  pct: number;
  /** Where this reading sits in ten years, 0-100. */
  percentile: number;
};

/**
 * The current reading as a dial.
 *
 * A gauge is the right form here for the same reason a fuel gauge is: the value
 * is a bounded share, and what you need is the position within the range, read
 * without counting. The number stays in the middle because a dial alone cannot
 * be read precisely.
 */
export default function BreadthGauge({ pct, percentile }: Props) {
  const tone = pct >= 50 ? "var(--signal-up)" : "var(--signal-down)";

  return (
    <div className="relative">
      <ChartContainer config={config} className="mx-auto aspect-square h-[132px]">
        <RadialBarChart
          data={[{ name: "pct", pct, fill: tone }]}
          startAngle={210}
          endAngle={-30}
          innerRadius="72%"
          outerRadius="100%"
          barSize={12}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
          <RadialBar
            dataKey="pct"
            background={{ fill: "var(--muted)" }}
            cornerRadius={6}
            isAnimationActive={false}
          />
        </RadialBarChart>
      </ChartContainer>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-[28px] leading-none tracking-tight">{pct.toFixed(0)}%</span>
        <span className="mt-1 text-[11px] text-muted-foreground">participating</span>
        <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          {percentile.toFixed(0)}th pctile
        </span>
      </div>
    </div>
  );
}
