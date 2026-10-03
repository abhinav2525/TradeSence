"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, XAxis, YAxis } from "recharts";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import { signed } from "@/lib/format";
import { useChartAnimation } from "@/lib/motion";

export type BucketBar = { bucket: string; median: number | null; n: number };

const LABELS: Record<string, string> = {
  "<20": "Under 20%", "20–40": "20–40%", "40–60": "40–60%", "60–80": "60–80%", "≥80": "Over 80%",
};
const config = { median: { label: "Median 3-month return", color: "var(--chart-muted)" } } satisfies ChartConfig;

/** Median 3-month return by breadth bucket; the selected condition's bar in brand. */
export default function ReturnBuckets({ data, all, highlight }: { data: BucketBar[]; all: number | null; highlight: string }) {
  const anim = useChartAnimation();
  const vals = [...data.map((d) => d.median ?? 0), all ?? 0, 0];
  const lo = Math.floor(Math.min(...vals) / 4) * 4;
  const hi = Math.max(4, Math.ceil(Math.max(...vals) / 4) * 4);
  return (
    <ChartContainer config={config} className="aspect-auto h-[calc(240px*var(--density-chart))] w-full">
      <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--grid-line)" vertical={false} />
        <XAxis
          dataKey="bucket"
          tickFormatter={(b: string) => LABELS[b] ?? b}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis
          domain={[lo, hi]}
          tickFormatter={(v: number) => `${v}%`}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        {all !== null && (
          <ReferenceLine y={all} stroke="var(--border-strong)" strokeDasharray="4 4" />
        )}
        <ChartTooltip
          cursor={{ fill: "var(--raised)" }}
          content={
            <ChartTooltipContent
              hideIndicator
              labelFormatter={(_l, payload) => {
                const b = payload?.[0]?.payload as BucketBar | undefined;
                return b ? LABELS[b.bucket] ?? b.bucket : "";
              }}
              formatter={(value, _name, item) => {
                const b = item?.payload as BucketBar | undefined;
                return (
                  <div className="flex w-full items-center justify-between gap-4 tabular-nums">
                    <span className="text-muted-foreground">{b?.n ?? 0} sessions</span>
                    <span className="font-semibold text-foreground">{value == null ? "—" : `${signed(Number(value), 1)}%`}</span>
                  </div>
                );
              }}
            />
          }
        />
        <Bar dataKey="median" radius={[4, 4, 0, 0]} {...anim}>
          {data.map((d) => (
            <Cell key={d.bucket} fill={d.bucket === highlight ? "var(--brand)" : "var(--chart-muted)"} />
          ))}
          <LabelList
            dataKey="median"
            position="top"
            formatter={(v: unknown) => (typeof v === "number" ? `${signed(v, 1)}%` : "")}
            className="fill-foreground-2 text-[11px] tabular-nums"
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
