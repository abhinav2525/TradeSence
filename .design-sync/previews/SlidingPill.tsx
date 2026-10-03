import { SlidingPill } from "tradesence";

const group = "seg relative inline-flex items-center gap-0.5 rounded-md border bg-raised p-0.5";
const btn = (on: boolean) =>
  "h-7 rounded-[8px] px-2.5 text-[12px] font-medium tabular-nums transition-colors " +
  (on ? "bg-thumb text-foreground shadow-thumb" : "text-muted-foreground hover:text-foreground");
const tab = (on: boolean) =>
  "inline-flex h-8 items-center gap-2 rounded-[8px] px-3 text-[13px] font-medium transition-colors " +
  (on ? "bg-thumb text-foreground shadow-thumb" : "text-muted-foreground hover:text-foreground");

export const TimeRange = () => (
  <div style={{ width: 420, padding: 16 }}>
    <div className={group} role="group" aria-label="Time range">
      <SlidingPill active="1y" />
      {["3M", "6M", "1Y", "3Y", "All"].map((r) => (
        <button key={r} type="button" aria-pressed={r === "1Y"} className={btn(r === "1Y")}>
          {r}
        </button>
      ))}
    </div>
  </div>
);

export const MovingAverage = () => (
  <div style={{ width: 420, padding: 16 }}>
    <div className={group} role="tablist" aria-label="Moving average">
      <SlidingPill active="ema200" />
      {["200-day SMA", "200-day EMA", "50-day SMA"].map((l, i) => (
        <button key={l} type="button" role="tab" aria-selected={i === 1} className={tab(i === 1)}>
          {l}
          <kbd className="hidden font-mono text-[10px] text-muted-foreground sm:inline">{i + 1}</kbd>
        </button>
      ))}
    </div>
  </div>
);

export const ScreenerSignal = () => (
  <div style={{ width: 460, padding: 16 }}>
    <div className={group} role="tablist" aria-label="Signal">
      <SlidingPill active="near" />
      {([["Crossed above", 2], ["Crossed below", 5], ["Near the line", 7]] as const).map(([t, n], i) => (
        <button key={t} type="button" role="tab" aria-selected={i === 2} className={tab(i === 2)}>
          {t}
          <span className="font-mono text-[11px] text-muted-foreground">{n}</span>
        </button>
      ))}
    </div>
  </div>
);

export const VolumeFilter = () => (
  <div style={{ width: 420, padding: 16 }}>
    <div className="flex items-center gap-2">
      <span className="text-[12px] font-medium text-muted-foreground">Volume</span>
      <div className={group} role="group" aria-label="Volume">
        <SlidingPill active="2" />
        {(["any", "1.5", "2", "3"] as const).map((v) => (
          <button key={v} type="button" aria-pressed={v === "2"} className={tab(v === "2") + " h-7 px-2.5 text-[12px]"}>
            {v === "any" ? "Any" : `≥${v}×`}
          </button>
        ))}
      </div>
    </div>
  </div>
);
