import { Badge, Card } from "tradesence";

export const Variants = () => (
  <div style={{ width: 420, padding: 16 }} className="flex flex-wrap items-center gap-2">
    <Badge variant="neutral">12 stocks</Badge>
    <Badge variant="outline">near line</Badge>
    <Badge variant="brand">New</Badge>
    <Badge variant="up">Above</Badge>
    <Badge variant="down">Below</Badge>
  </div>
);

export const ShadcnAliases = () => (
  <div style={{ width: 420, padding: 16 }} className="flex flex-wrap items-center gap-2">
    <Badge variant="default">Default</Badge>
    <Badge variant="secondary">Secondary</Badge>
    <Badge variant="destructive">Washed out</Badge>
  </div>
);

export const Signals = () => (
  <div style={{ width: 420, padding: 16 }} className="flex flex-wrap items-center gap-2">
    <Badge variant="up">Improving</Badge>
    <Badge variant="down">Rare low</Badge>
    <Badge variant="down">Below zero</Badge>
    <Badge variant="neutral">Typical</Badge>
    <Badge variant="outline">2.1× volume</Badge>
  </div>
);

export const InCardHeader = () => (
  <div style={{ width: 420, padding: 16 }}>
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="size-2 rounded-full bg-down" />
          <h2 className="text-heading text-foreground">Below the 200-day SMA</h2>
        </div>
        <Badge variant="down">42 stocks</Badge>
      </div>
      <div className="flex items-center justify-between px-5 py-3">
        <span className="text-[13px] font-semibold text-foreground">
          HDFCBANK
          <Badge variant="outline" className="ml-2 align-middle">near line</Badge>
        </span>
        <span className="text-[13px] font-medium text-down">−1.42%</span>
      </div>
    </Card>
  </div>
);
