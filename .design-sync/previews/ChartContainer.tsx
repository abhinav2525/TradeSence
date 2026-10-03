import { ChartContainer, ChartTooltipContent, ChartLegendContent } from "tradesence";

// Recharts itself is not exported from "tradesence", so these cells hand the
// container a small SVG chart. ChartContainer's ResponsiveContainer clones its
// child with the measured width and height, exactly as it does for <LineChart>.

const breadth = [62, 60, 64, 66, 63, 58, 55, 57, 52, 48, 50, 44, 41, 38, 40, 34, 30, 27, 24, 22, 19, 21, 18, 16];
const close = [1412, 1398, 1421, 1436, 1428, 1407, 1389, 1395, 1376, 1351, 1362, 1340, 1328, 1347, 1359, 1342, 1330, 1351, 1368, 1361, 1379, 1372, 1366, 1374];
const sma200 = [1352, 1353, 1354, 1355, 1356, 1356, 1357, 1357, 1358, 1358, 1359, 1359, 1359, 1360, 1360, 1360, 1361, 1361, 1361, 1362, 1362, 1362, 1363, 1363];

type Series = { key: string; values: number[]; dashed?: boolean };
type SvgProps = {
  width?: number;
  height?: number;
  series: Series[];
  domain: [number, number];
  ticks: number[];
  fmt: (v: number) => string;
  line?: number;
};

function Lines({ width = 0, height = 0, series, domain, ticks, fmt, line }: SvgProps) {
  if (width <= 0 || height <= 0) return null;
  const left = 44, right = 8, top = 8, bottom = 8;
  const w = width - left - right, h = height - top - bottom;
  const [lo, hi] = domain;
  const x = (i: number, n: number) => left + (i / (n - 1)) * w;
  const y = (v: number) => top + (1 - (v - lo) / (hi - lo)) * h;
  return (
    <svg width={width} height={height} className="recharts-surface">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={left + w} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeOpacity={0.6} />
          <text x={left - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted-foreground)">{fmt(t)}</text>
        </g>
      ))}
      {line !== undefined && (
        <line x1={left} x2={left + w} y1={y(line)} y2={y(line)} stroke="var(--down)" strokeDasharray="4 4" />
      )}
      {series.map((s) => (
        <path
          key={s.key}
          d={s.values.map((v, i) => `${i ? "L" : "M"}${x(i, s.values.length).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}
          fill="none"
          stroke={`var(--color-${s.key})`}
          strokeWidth={s.dashed ? 1.5 : 2}
          strokeDasharray={s.dashed ? "4 4" : undefined}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

const breadthConfig = { pct: { label: "Share above the average", color: "var(--chart-1)" } };
const priceConfig = {
  close: { label: "Close", color: "var(--chart-1)" },
  sma200: { label: "200-day average", color: "var(--muted-foreground)" },
};

export const BreadthLine = () => (
  <div style={{ width: 480, padding: 16 }}>
    <div className="rounded-lg border bg-card p-3 shadow-card">
      <p className="px-2 pb-2 text-[12px] font-medium text-muted-foreground">Above the 200-day SMA · last 24 sessions</p>
      <ChartContainer config={breadthConfig} className="aspect-auto h-[220px] w-full">
        <Lines
          series={[{ key: "pct", values: breadth }]}
          domain={[0, 100]}
          ticks={[0, 20, 50, 100]}
          fmt={(v) => `${v}%`}
          line={20}
        />
      </ChartContainer>
    </div>
  </div>
);

export const PriceWithLegend = () => (
  <div style={{ width: 480, padding: 16 }}>
    <div className="rounded-lg border bg-card p-3 shadow-card">
      <ChartContainer config={priceConfig} className="aspect-auto h-[240px] w-full">
        <div className="flex h-full w-full flex-col">
          <ChartLegendContent
            verticalAlign="top"
            payload={[
              { value: "close", dataKey: "close", color: "var(--chart-1)", type: "line" },
              { value: "sma200", dataKey: "sma200", color: "var(--muted-foreground)", type: "line" },
            ]}
          />
          <Lines
            width={430}
            height={190}
            series={[{ key: "close", values: close }, { key: "sma200", values: sma200, dashed: true }]}
            domain={[1300, 1450]}
            ticks={[1300, 1350, 1400, 1450]}
            fmt={(v) => v.toLocaleString("en-IN")}
          />
        </div>
      </ChartContainer>
    </div>
  </div>
);

const dot = (color: string) => (
  <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: color }} />
);

export const TooltipContent = () => (
  <div style={{ width: 300, padding: 16 }}>
    <ChartContainer config={priceConfig} className="aspect-auto h-[140px] w-full">
      <div className="flex items-start">
        <ChartTooltipContent
          active
          indicator="dot"
          label="RELIANCE · 1 Oct 2026"
          payload={[
            { name: "close", dataKey: "close", value: 1374.2, color: "var(--chart-1)", payload: { close: 1374.2 } },
            { name: "sma200", dataKey: "sma200", value: 1362.85, color: "var(--muted-foreground)", payload: { sma200: 1362.85 } },
          ]}
          formatter={(value, name) => (
            <div className="flex w-full items-center gap-2">
              {dot(name === "close" ? "var(--chart-1)" : "var(--muted-foreground)")}
              <span className="text-muted-foreground">{name === "close" ? "Close" : "200-day average"}</span>
              <span className="ml-auto pl-4 font-semibold tabular-nums text-foreground">
                ₹{Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
        />
      </div>
    </ChartContainer>
  </div>
);
