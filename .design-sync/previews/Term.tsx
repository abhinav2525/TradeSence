import { Term, Card } from "tradesence";

export const CardTitles = () => (
  <div style={{ width: 360, padding: 16 }}>
    <div className="flex flex-col gap-3">
      <h2 className="text-heading text-foreground"><Term id="breadth">Breadth over time</Term></h2>
      <h2 className="text-heading text-foreground"><Term id="washout">Washed out</Term></h2>
      <h2 className="text-heading text-foreground"><Term id="mcclellan">McClellan oscillator</Term></h2>
      <h2 className="text-heading text-foreground"><Term id="near-the-line">Near the line</Term></h2>
    </div>
  </div>
);

export const EyebrowLabel = () => (
  <div style={{ width: 320, padding: 16 }}>
    <Card className="p-5">
      <p className="text-eyebrow uppercase text-muted-foreground">
        <Term id="breadth" today="16%">Above the 200-day SMA</Term>
      </p>
      <p className="mt-4 text-display text-foreground">16<span className="ml-1 text-[0.45em] font-medium tracking-normal text-muted-foreground">%</span></p>
    </Card>
  </div>
);

export const TileLabels = () => (
  <div style={{ width: 520, padding: 16 }}>
    <div className="grid grid-cols-2 gap-3">
      {([
        ["percentile", "Percentile", "3.0"],
        ["summation-index", "Summation index", "−1,560"],
        ["volume-ratio", "Volume vs 20d", "2.3×"],
        ["drawdown", "How far below its high", "−18.4%"],
      ] as const).map(([id, label, v]) => (
        <Card key={id} className="p-4">
          <p className="text-[12px] font-medium text-muted-foreground"><Term id={id}>{label}</Term></p>
          <p className="mt-3 text-metric tabular-nums text-foreground">{v}</p>
        </Card>
      ))}
    </div>
  </div>
);

export const DefaultName = () => (
  <div style={{ width: 360, padding: 16 }}>
    <p className="text-[13px] leading-5 text-foreground-2">
      Read alongside the <Term id="ad-line" className="font-medium text-foreground" /> and the{" "}
      <Term id="breadth-thrust" className="font-medium text-foreground" />, which fire rarely.
    </p>
  </div>
);
