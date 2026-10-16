"use client";

import { Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import { formatDate } from "@/lib/format";
import { useChartAnimation } from "@/lib/motion";
import type { SharePoint } from "@/query/money-flow";

const config = { sharePct: { label: "Share of all trading", color: "var(--chart-1)" } } satisfies ChartConfig;

/**
 * A sector's weekly share of all trading over the past year, no axes: the "every week between" beside the
 * two snapshots. Its own scale per row (shape, not level; the row's numbers carry the level). One series: no legend.
 */
export default function ShareSpark({ data, label }: { data: SharePoint[]; label: string }) {
  const anim = useChartAnimation();
  return (
    <ChartContainer config={config} aria-label={label} className="aspect-auto h-[calc(36px*var(--density-chart))] w-full">
      <LineChart data={data} margin={{ top: 3, right: 3, bottom: 3, left: 3 }}>
        <XAxis dataKey="weekEnd" hide />
        <YAxis domain={["dataMin", "dataMax"]} hide />
        <ChartTooltip
          cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
          content={
            <ChartTooltipContent
              indicator="dot"
              labelFormatter={(_l, payload) => `Week to ${formatDate((payload?.[0]?.payload as SharePoint | undefined)?.weekEnd)}`}
              formatter={(value) => <span className="font-semibold tabular-nums text-foreground">{Number(value).toFixed(1)}% of all trading</span>}
            />
          }
        />
        <Line dataKey="sharePct" type="monotone" stroke="var(--chart-1)" strokeWidth={1.5} dot={false} connectNulls={false} {...anim}
          activeDot={{ r: 3, strokeWidth: 2, stroke: "var(--card)", fill: "var(--chart-1)" }} />
      </LineChart>
    </ChartContainer>
  );
}
