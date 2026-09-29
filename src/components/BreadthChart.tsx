"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";
import type { BreadthPoint } from "../query/breadth";

type Props = { data: BreadthPoint[]; label: string; selectedDate?: string | null };

function TooltipBody({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as BreadthPoint;
  return (
    <div
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 12,
        color: "var(--text-primary)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
      }}
    >
      <div style={{ color: "var(--text-secondary)", marginBottom: 2 }}>{p.date}</div>
      <div style={{ fontWeight: 600, fontSize: 15 }}>{p.pctAbove.toFixed(1)}% above</div>
      <div style={{ color: "var(--text-secondary)" }}>
        {p.above} of {p.total} constituents
      </div>
    </div>
  );
}

/**
 * Single series, so no legend box — the heading names it. The 50% reference
 * line is the only other mark: it is the line that separates a market where
 * most names participate from one carried by a few.
 */
export default function BreadthChart({ data, label, selectedDate }: Props) {
  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--axis)" }}
            minTickGap={64}
            interval={Math.max(1, Math.ceil(data.length / 12))}
            tickFormatter={(d: string) => d.slice(0, 7)}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v}%`}
          />
          <ReferenceLine
            y={50}
            stroke="var(--axis)"
            strokeDasharray="3 3"
            label={{ value: "50%", position: "right", fill: "var(--text-muted)", fontSize: 11 }}
          />
          {selectedDate && (
            <ReferenceLine
              x={selectedDate}
              stroke="var(--text-primary)"
              strokeWidth={1}
              strokeDasharray="2 2"
              label={{
                value: "selected",
                position: "top",
                fill: "var(--text-secondary)",
                fontSize: 10,
              }}
            />
          )}
          <Tooltip content={<TooltipBody />} cursor={{ stroke: "var(--axis)", strokeWidth: 1 }} />
          <Line
            type="monotone"
            dataKey="pctAbove"
            name={label}
            stroke="var(--series-1)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface-1)" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
