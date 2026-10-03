"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatDate, formatPrice } from "@/lib/format";
import { dateTicks } from "@/lib/ticks";
import Term from "@/components/Term";
import { useChartAnimation } from "@/lib/motion";

type Point = { date: string; close: number; sma200: number | null };

const config = {
  close: { label: "Close", color: "var(--chart-1)" },
  sma200: { label: "200-day average", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

/** Two series, so it carries a legend. Adjusted, so a split is not a cliff. */
export default function StockPriceChart({ data, selectedDate }: { data: Point[]; selectedDate?: string | null }) {
  const anim = useChartAnimation();
  const axis = dateTicks(data.map((p) => p.date), 8);
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 px-card-x pb-2 pt-4">
        <div>
          <h2 className="text-heading text-foreground"><Term id="adjusted-prices">Price and its 200-day average</Term></h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {data[0] ? `${formatDate(data[0].date)} – ${formatDate(data.at(-1)!.date)}` : "No sessions"}
          </p>
        </div>
        <div className="flex items-center gap-4 text-[12px] text-foreground-2">
          <span className="flex items-center gap-1.5"><i className="h-0.5 w-4 rounded-full bg-chart-1" aria-hidden="true" />Close</span>
          <span className="flex items-center gap-1.5"><i className="h-0.5 w-4 border-t border-dashed border-muted-foreground" aria-hidden="true" />200-day average</span>
        </div>
      </div>
      <ChartContainer config={config} className="aspect-auto h-[calc(260px*var(--density-chart))] w-full px-2 pb-3">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid-line)" vertical={false} />
          <XAxis dataKey="date" ticks={axis.ticks} tickFormatter={axis.label} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickFormatter={(v: number) => formatPrice(v).replace(/\.\d+$/, "")} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} width={64} domain={["auto", "auto"]} />
          {selectedDate && <ReferenceLine x={selectedDate} stroke="var(--foreground)" strokeOpacity={0.35} />}
          <ChartTooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
            content={
              <ChartTooltipContent
                indicator="line"
                labelFormatter={(_l, payload) => {
                  const p = payload?.[0]?.payload as Point | undefined;
                  return p ? formatDate(p.date) : "";
                }}
                formatter={(v, name) => (
                  <div className="flex w-full items-center justify-between gap-4 tabular-nums">
                    <span className="text-muted-foreground">{name === "close" ? "Close" : "200-day"}</span>
                    <span className="font-semibold text-foreground">₹{formatPrice(Number(v))}</span>
                  </div>
                )}
              />
            }
          />
          <Line dataKey="sma200" type="monotone" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} {...anim} connectNulls={false} />
          <Line dataKey="close" type="monotone" stroke="var(--chart-1)" strokeWidth={2} dot={false} {...anim} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: "var(--chart-1)" }} />
        </LineChart>
      </ChartContainer>
    </div>
  );
}
