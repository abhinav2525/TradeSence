"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

export type AreaPoint = { date: string; pct: number; above: number; total: number };

const config = {
  pct: { label: "Share above the average", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** Trading sessions per window. ~250 sessions to the year on the NSE. */
const RANGES = [
  { key: "1y", label: "1Y", sessions: 250 },
  { key: "3y", label: "3Y", sessions: 750 },
  { key: "5y", label: "5Y", sessions: 1250 },
  { key: "all", label: "All", sessions: Infinity },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

type Props = { data: AreaPoint[]; selectedDate?: string | null };

export default function BreadthArea({ data, selectedDate }: Props) {
  const [range, setRange] = useState<RangeKey>("all");

  const visible = useMemo(() => {
    const n = RANGES.find((r) => r.key === range)!.sessions;
    const sliced = n === Infinity ? data : data.slice(-n);
    // A selected session outside the window would leave its marker invisible,
    // so widen back to everything rather than lie about where you are.
    if (selectedDate && sliced.length && sliced[0]!.date > selectedDate) return data;
    return sliced;
  }, [data, range, selectedDate]);

  const ticks = useMemo(() => axisTicks(visible), [visible]);
  const granular = visible.length <= 400;

  return (
    <div>
      <div className="mb-2 flex items-center justify-end gap-1 px-2">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRange(r.key)}
            aria-pressed={range === r.key}
            className={cn(
              "rounded px-2 py-0.5 font-mono text-[11px] transition-colors",
              range === r.key
                ? "bg-primary/15 text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <ChartContainer config={config} className="h-[190px] w-full">
        <AreaChart data={visible} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="breadthFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.04} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="var(--grid-line)" vertical={false} />
          <XAxis
            dataKey="date"
            ticks={ticks}
            tickFormatter={(d: string) => (granular ? d.slice(2, 7) : d.slice(0, 4))}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 50, 100]}
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
                indicator="line"
                labelFormatter={(l) => String(l)}
                formatter={(value, _name, item) => {
                  const p = item?.payload as AreaPoint | undefined;
                  return (
                    <span className="font-mono text-xs">
                      {Number(value).toFixed(1)}% — {p?.above} of {p?.total}
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
    </div>
  );
}

/** About a dozen ticks, whatever the window — never 2,500 measured candidates. */
function axisTicks(data: AreaPoint[]): string[] {
  if (data.length === 0) return [];
  if (data.length > 400) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const d of data) {
      const y = d.date.slice(0, 4);
      if (!seen.has(y)) { seen.add(y); out.push(d.date); }
    }
    return out;
  }
  const step = Math.max(1, Math.ceil(data.length / 8));
  return data.filter((_, i) => i % step === 0).map((d) => d.date);
}
