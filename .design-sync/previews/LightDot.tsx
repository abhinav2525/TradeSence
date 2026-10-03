import { LightDot } from "tradesence";

export const AllLights = () => (
  <div style={{ display: "flex", gap: 20, alignItems: "center", padding: 16 }}>
    <LightDot light="green" />
    <LightDot light="amber" />
    <LightDot light="red" />
  </div>
);

export const NotEnoughHistory = () => (
  <div style={{ padding: 16 }}>
    <LightDot light={null} />
  </div>
);

export const InACheckRow = () => (
  <div className="flex w-80 items-center justify-between rounded-lg border bg-card p-4 shadow-card">
    <span className="text-[13px] text-foreground">Trend</span>
    <LightDot light="green" />
  </div>
);
