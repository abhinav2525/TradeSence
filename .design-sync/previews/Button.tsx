import { Button } from "tradesence";

export const Variants = () => (
  <div style={{ width: 520, padding: 16 }} className="flex flex-wrap items-center gap-2">
    <Button variant="default">Run screener</Button>
    <Button variant="secondary">Export CSV</Button>
    <Button variant="outline">200-day SMA</Button>
    <Button variant="ghost">Reset</Button>
    <Button variant="link">Read more →</Button>
    <Button variant="destructive">Clear watchlist</Button>
  </div>
);

export const Sizes = () => (
  <div style={{ width: 420, padding: 16 }} className="flex flex-wrap items-center gap-2">
    <Button size="sm">Small</Button>
    <Button size="default">Default</Button>
    <Button size="lg">Large</Button>
    <Button size="icon" variant="outline" aria-label="Previous session">‹</Button>
  </div>
);

export const SessionNav = () => (
  <div style={{ width: 420, padding: 16 }} className="flex items-center gap-2">
    <Button size="sm" variant="outline" aria-label="Previous session">← 30 Sep</Button>
    <span className="px-2 text-[13px] tabular-nums text-foreground">1 Oct 2026</span>
    <Button size="sm" variant="outline" disabled aria-label="Next session">2 Oct →</Button>
  </div>
);

export const Disabled = () => (
  <div style={{ width: 420, padding: 16 }} className="flex flex-wrap items-center gap-2">
    <Button disabled>Run screener</Button>
    <Button variant="secondary" disabled>Export CSV</Button>
    <Button variant="outline" disabled>200-day SMA</Button>
  </div>
);
