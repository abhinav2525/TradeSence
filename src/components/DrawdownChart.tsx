"use client";

import { Area, AreaChart, CartesianGrid, ReferenceDot, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatDate } from "@/lib/format";
import { dateTicks } from "@/lib/ticks";
import Term from "@/components/Term";

type Point = { date: string; pct: number };

const config = { pct: { label: "Below its high", color: "var(--down)" } } satisfies ChartConfig;

/** How far below its previous high the stock sat, every session: the shape of its falls and recoveries. */
export default function DrawdownChart({ data, trough }: { data: Point[]; trough: { date: string; pct: number } | null }) {
  const axis = dateTicks(data.map((p) => p.date), 7);
  const deepest = Math.min(...data.map((p) => p.pct), 0);
  const step = deepest < -60 ? 25 : deepest < -30 ? 10 : 5;
  const lo = Math.floor(deepest / step) * step;
  const ticks = Array.from({ length: Math.round(-lo / step) + 1 }, (_, i) => -i * step);
  return (
    <div>
      <div className="px-5 pb-2 pt-4">
        <h2 className="text-heading text-foreground"><Term id="drawdown">How far below its high</Term></h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">% below the highest close so far, every session</p>
      </div>
      <ChartContainer config={config} className="aspect-auto h-[220px] w-full px-2 pb-3">
        <AreaChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--down)" stopOpacity={0.05} />
              <stop offset="100%" stopColor="var(--down)" stopOpacity={0.3} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--grid-line)" vertical={false} />
          <XAxis dataKey="date" ticks={axis.ticks} tickFormatter={axis.label} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis domain={[lo, 0]} ticks={ticks} tickFormatter={(v: number) => (v === 0 ? "0%" : `−${Math.abs(v)}%`)} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
          <ChartTooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
            content={
              <ChartTooltipContent
                indicator="dot"
                labelFormatter={(_l, payload) => {
                  const p = payload?.[0]?.payload as Point | undefined;
                  return p ? formatDate(p.date) : "";
                }}
                formatter={(v) => (
                  <div className="flex w-full items-center justify-between gap-4 tabular-nums">
                    <span className="text-muted-foreground">Below its high</span>
                    <span className="font-semibold text-foreground">{Number(v) === 0 ? "At a high" : `−${Math.abs(Number(v)).toFixed(1)}%`}</span>
                  </div>
                )}
              />
            }
          />
          <Area dataKey="pct" type="monotone" stroke="var(--down)" strokeWidth={1.5} fill="url(#ddFill)" isAnimationActive={false} dot={false} />
          {trough && trough.pct < 0 && (
            <ReferenceDot
              x={trough.date}
              y={trough.pct}
              r={4}
              fill="var(--down)"
              stroke="var(--card)"
              strokeWidth={2}
              label={{ value: `Worst: −${Math.abs(trough.pct).toFixed(0)}%, ${formatDate(trough.date)}`, position: "right", fill: "var(--foreground-2)", fontSize: 11 }}
            />
          )}
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
