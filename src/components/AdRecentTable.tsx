import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { formatDayMonth, signed } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AdPoint } from "@/query/advance-decline";

const head = "h-9 px-3 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground";

/** The last few sessions as numbers, latest first: the charts' exact values. */
export default function AdRecentTable({ rows, className }: { rows: AdPoint[]; className?: string }) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="border-b px-5 py-3.5">
        <h2 className="text-heading text-foreground">Recent sessions</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Latest first</p>
      </div>
      <Table className="tabular-nums">
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(head, "pl-5")}>Date</TableHead>
            <TableHead className={cn(head, "text-right")}>Adv</TableHead>
            <TableHead className={cn(head, "text-right")}>Dec</TableHead>
            <TableHead className={cn(head, "text-right")}>Net</TableHead>
            <TableHead className={cn(head, "pr-5 text-right")}>McClellan</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.date} className="hover:bg-raised">
              <TableCell className="py-2.5 pl-5 pr-3 text-[13px] text-foreground">{formatDayMonth(r.date)}</TableCell>
              <TableCell className="px-3 py-2.5 text-right text-[13px] text-foreground-2">{r.advancing}</TableCell>
              <TableCell className="px-3 py-2.5 text-right text-[13px] text-foreground-2">{r.declining}</TableCell>
              <TableCell
                className={cn(
                  "px-3 py-2.5 text-right text-[13px] font-medium",
                  r.net > 0 ? "text-up" : r.net < 0 ? "text-down" : "text-muted-foreground",
                )}
              >
                {signed(r.net)}
              </TableCell>
              <TableCell className="py-2.5 pl-3 pr-5 text-right text-[13px] text-foreground">
                {r.mcclellan === null ? "—" : signed(r.mcclellan, 1)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
