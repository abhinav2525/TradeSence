"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import { formatDate, signed } from "@/lib/format";
import { useChartAnimation } from "@/lib/motion";
import type { HistoryPoint } from "@/query/money-flow";

const config = { ratio: { label: "Trading vs normal", color: "var(--chart-1)" } } satisfies ChartConfig;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const month = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`;

/** A ring on weeks that contained a short special session, so their dip isn't misread. */
function ShortDot(props: { cx?: number; cy?: number; payload?: HistoryPoint }) {
  const { cx, cy, payload } = props;
  if (!payload?.shortSession || cx === undefined || cy === undefined) return null;
  return <circle cx={cx} cy={cy} r={4} fill="var(--card)" stroke="var(--muted-foreground)" strokeWidth={2} />;
}

/** One sector's weekly trading vs its own normal over the past year, with 1× marked. One series: no legend. */
export default function FlowHistoryChart({ data }: { data: HistoryPoint[] }) {
  const anim = useChartAnimation();
  const top = Math.max(2, Math.ceil(Math.max(...data.map((d) => d.ratio ?? 0))));
  const yTicks = Array.from({ length: top + 1 }, (_, i) => i); // whole steps, so 1× is always labelled
  // one tick per month: the first week ending in each month
  const ticks = data.filter((d, i) => i === 0 || d.weekEnd.slice(0, 7) !== data[i - 1]!.weekEnd.slice(0, 7)).map((d) => d.weekEnd);
  return (
    <ChartContainer config={config} className="aspect-auto h-[calc(220px*var(--density-chart))] w-full">
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="weekEnd"
          ticks={ticks}
          tickFormatter={month}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          minTickGap={16}
        />
        <YAxis
          domain={[0, top]}
          ticks={yTicks}
          tickFormatter={(v: number) => `${v}×`}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={36}
        />
        <ReferenceLine y={1} stroke="var(--foreground)" strokeOpacity={0.5} strokeDasharray="4 4" />
        <ChartTooltip
          cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
          content={
            <ChartTooltipContent
              indicator="dot"
              labelFormatter={(_l, payload) => `Week to ${formatDate((payload?.[0]?.payload as HistoryPoint | undefined)?.weekEnd)}`}
              formatter={(value, _n, item) => {
                const p = item.payload as HistoryPoint;
                return (
                  <span className="flex flex-col gap-0.5">
                    <span className="font-semibold tabular-nums text-foreground">{Number(value).toFixed(2)}× normal</span>
                    {p.medianMove !== null && <span className="text-muted-foreground">Median move {signed(p.medianMove, 1)}%</span>}
                    {p.shortSession && <span className="text-muted-foreground">Includes a short special session</span>}
                  </span>
                );
              }}
            />
          }
        />
        <Line
          dataKey="ratio"
          type="monotone"
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={<ShortDot />}
          connectNulls={false}
          {...anim}
          activeDot={{ r: 3, strokeWidth: 2, stroke: "var(--card)", fill: "var(--chart-1)" }}
        />
      </LineChart>
    </ChartContainer>
  );
}
