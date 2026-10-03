import { CountUp, Card } from "tradesence";

export const DisplayPercent = () => (
  <div style={{ width: 300, padding: 16 }}>
    <p className="text-eyebrow uppercase text-muted-foreground">Above the 200-day SMA</p>
    <p className="mt-4 text-display text-foreground">
      <CountUp text="16" />
      <span className="ml-1 text-[0.45em] font-medium tracking-normal text-muted-foreground">%</span>
    </p>
  </div>
);

export const SignedNetAdvances = () => (
  <div style={{ width: 300, padding: 16 }}>
    <p className="text-eyebrow uppercase text-muted-foreground">Net advances</p>
    <p className="mt-4 text-display tabular-nums text-foreground">
      <CountUp text="−24" />
    </p>
    <p className="mt-3 text-[13px] leading-5 text-foreground-2">13 rose, 37 fell on 1 Oct 2026.</p>
  </div>
);

export const MetricFormats = () => (
  <div style={{ width: 520, padding: 16 }}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
      {[
        ["Summation index", "−1,560"],
        ["Avg. daily value", "₹1,24,580"],
        ["McClellan", "+42.7"],
      ].map(([label, v]) => (
        <Card key={label} className="p-4">
          <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
          <p className="mt-3 text-metric tabular-nums text-foreground">
            <CountUp text={v} />
          </p>
        </Card>
      ))}
    </div>
  </div>
);

export const NonNumeric = () => (
  <div style={{ width: 300, padding: 16 }}>
    <div className="flex items-baseline gap-6">
      <span className="text-metric text-foreground"><CountUp text="16–86" /></span>
      <span className="text-metric text-muted-foreground"><CountUp text="—" /></span>
    </div>
    <p className="mt-2 text-[12px] text-foreground-2">Ranges and blanks render unchanged.</p>
  </div>
);
