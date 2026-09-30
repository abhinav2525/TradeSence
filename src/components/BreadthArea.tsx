"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";

export type AreaPoint = { date: string; pct: number; above: number; total: number };

const config = {
  pct: { label: "Above the average", color: "var(--chart-1)" },
} satisfies ChartConfig;

type Props = { data: AreaPoint[]; selectedDate?: string | null };

/**
 * Breadth is a bounded 0-100% share, so an area reads more honestly than a
 * line: the filled region *is* the portion of the market participating.
 */
export default function BreadthArea({ data, selectedDate }: Props) {
  const ticks = yearTicks(data);

  return (
    <ChartContainer config={config} className="h-[280px] w-full">
      <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id="breadthFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.45} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.04} />
          </linearGradient>
        </defs>

        <CartesianGrid stroke="var(--grid-line)" vertical={false} />
        <XAxis
          dataKey="date"
          ticks={ticks}
          tickFormatter={(d: string) => d.slice(0, 4)}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 50, 100]}
          tickFormatter={(v: number) => `${v}`}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={38}
        />
        <ReferenceLine y={50} stroke="var(--border)" strokeDasharray="2 4" />
        {selectedDate && (
          <ReferenceLine
            x={selectedDate}
            stroke="var(--foreground)"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
        )}
        <ChartTooltip
          cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
          content={
            <ChartTooltipContent
              labelFormatter={(l) => String(l)}
              formatter={(value, _name, item) => {
                const p = item?.payload as AreaPoint | undefined;
                return (
                  <span className="font-mono text-xs">
                    {Number(value).toFixed(1)}% · {p?.above}/{p?.total}
                  </span>
                );
              }}
            />
          }
        />
        <Area
          dataKey="pct"
          type="monotone"
          stroke="var(--chart-1)"
          strokeWidth={1.75}
          fill="url(#breadthFill)"
          isAnimationActive={false}
          dot={false}
          activeDot={{ r: 3, strokeWidth: 2, stroke: "var(--card)" }}
        />
      </AreaChart>
    </ChartContainer>
  );
}

/** One tick per calendar year — Recharts should not text-measure 2,500 labels. */
function yearTicks(data: AreaPoint[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of data) {
    const y = d.date.slice(0, 4);
    if (!seen.has(y)) {
      seen.add(y);
      out.push(d.date);
    }
  }
  return out;
}
