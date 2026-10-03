import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const KIND: Record<string, string> = {
  split: "Split",
  bonus: "Bonus",
  "bonus+split": "Split and bonus",
  consolidation: "Consolidation",
  demerger: "Demerger",
  rename: "Renamed",
};

type Props = { events: { date: string; kind: string; text: string }[]; dividends12m: number; date: string; className?: string };

/** Share-count events and renames: the reasons a raw price chart would lie. */
export default function StockEvents({ events, dividends12m, date, className }: Props) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <div className="border-b px-card-x py-3.5">
        <h2 className="text-heading text-foreground">Events</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Splits, bonuses, demergers and renames</p>
      </div>
      {events.length === 0 ? (
        <p className="px-card-x py-6 text-body-sm text-muted-foreground">No splits, bonuses, demergers or renames on record.</p>
      ) : (
        <ul className="divide-y">
          {events.map((e) => (
            <li key={`${e.date}-${e.text}`} className="px-card-x py-2.5">
              <p className="flex items-baseline justify-between gap-3 text-body-sm">
                <span className="font-medium text-foreground">{KIND[e.kind] ?? e.kind}</span>
                <span className="tabular-nums text-muted-foreground">{formatDate(e.date)}</span>
              </p>
              <p className="mt-0.5 text-[12px] leading-4 text-foreground-2">{e.text}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-auto border-t px-card-x py-3 text-[12px] text-muted-foreground">
        {dividends12m} {dividends12m === 1 ? "dividend" : "dividends"} in the 12 months to {formatDate(date)}.
      </p>
    </Card>
  );
}
