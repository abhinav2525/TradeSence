import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CrossingStat } from "@/query/crossings";

type Props = { rows: CrossingStat[]; maLabel: string };

const head = "h-9 px-3 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground";

export default function CrossingsTable({ rows, maLabel }: Props) {
  if (rows.length === 0) {
    return <p className="px-5 py-10 text-body-sm text-muted-foreground">No data yet.</p>;
  }
  const max = Math.max(...rows.map((r) => r.crossings), 1);

  return (
    <Table containerClassName="max-h-[560px] overflow-y-auto" className="tabular-nums">
      {/* sticky so the column names survive scrolling */}
      <TableHeader className="sticky top-0 z-10 bg-card">
        <TableRow className="hover:bg-transparent">
          <TableHead className={cn(head, "pl-5")}>Symbol</TableHead>
          <TableHead className={cn(head, "text-right")}>Crossings</TableHead>
          <TableHead className={cn(head, "hidden text-right sm:table-cell")}>Avg run</TableHead>
          <TableHead className={head}>Now</TableHead>
          <TableHead className={cn(head, "hidden text-right md:table-cell")}>In run</TableHead>
          <TableHead className={cn(head, "hidden pr-5 text-right sm:table-cell")}>Last crossed</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const above = r.currentState === "above";
          return (
            <TableRow key={r.symbol} className="hover:bg-raised">
              <TableCell className="py-2.5 pl-5 pr-3 text-body-sm font-semibold text-foreground"><Link href={`/stock/${encodeURIComponent(r.symbol)}`} prefetch={false} className="hover:underline">{r.symbol}</Link></TableCell>
              <TableCell className="px-3 py-2.5">
                <div className="flex items-center justify-end gap-2.5">
                  <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-chart-muted md:flex" aria-hidden="true">
                    <span className="grow-x h-full rounded-full bg-brand" style={{ width: `${Math.max(3, (r.crossings / max) * 100)}%` }} />
                  </span>
                  <span className="w-8 text-right text-body-sm font-medium text-foreground">{r.crossings}</span>
                </div>
              </TableCell>
              <TableCell className="hidden px-3 py-2.5 text-right text-body-sm text-muted-foreground sm:table-cell">
                {r.avgDaysPerRun ? `${r.avgDaysPerRun.toFixed(0)}d` : "—"}
              </TableCell>
              <TableCell className="px-3 py-2.5">
                <Badge variant={above ? "up" : "down"} title={`${above ? "Above" : "Below"} the ${maLabel}`}>
                  {above ? <ArrowUpRight className="size-3" aria-hidden="true" /> : <ArrowDownRight className="size-3" aria-hidden="true" />}
                  {above ? "Above" : "Below"}
                </Badge>
              </TableCell>
              <TableCell className="hidden px-3 py-2.5 text-right text-body-sm text-foreground md:table-cell">{r.daysInCurrentRun}</TableCell>
              <TableCell className="hidden py-2.5 pl-3 pr-5 text-right text-body-sm text-muted-foreground sm:table-cell">
                {r.lastCrossing ? formatDate(r.lastCrossing) : "Never"}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
