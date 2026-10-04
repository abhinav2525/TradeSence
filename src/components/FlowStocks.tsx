import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Term from "@/components/Term";
import { formatCrore, signed } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FlowRow } from "@/indicators/money-flow";

type Row = FlowRow & { extra: number | null; ratio: number | null };
const head = "h-row-head px-3 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground";

/** A sector's stocks by money above their own normal; Report Card links where one exists. */
export default function FlowStocks({ rows, withCard }: { rows: Row[]; withCard: Set<string> }) {
  return (
    <div className="max-h-[560px] overflow-auto">
      <Table className="tabular-nums">
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(head, "pl-card-x")}>Stock</TableHead>
            <TableHead className={cn(head, "text-right")}>Extra ₹</TableHead>
            <TableHead className={cn(head, "text-right")}><Term id="trading-vs-normal">vs normal</Term></TableHead>
            <TableHead className={cn(head, "hidden text-right sm:table-cell")}><Term id="value-traded">₹ traded</Term></TableHead>
            <TableHead className={cn(head, "pr-card-x text-right")}>Price</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.symbol} className="hover:bg-raised">
              <TableCell className="py-cell pl-card-x pr-3 text-body-sm font-semibold text-foreground">
                {withCard.has(r.symbol)
                  ? <Link href={`/stock/${encodeURIComponent(r.symbol)}`} prefetch={false} className="hover:underline">{r.symbol}</Link>
                  : r.symbol}
              </TableCell>
              <TableCell className={cn("px-3 py-cell text-right text-body-sm", r.extra === null ? "text-muted-foreground" : r.extra >= 0 ? "text-foreground" : "text-foreground-2")}>
                {r.extra === null ? "—" : `${r.extra >= 0 ? "+" : "−"}${formatCrore(Math.abs(r.extra))}`}
              </TableCell>
              <TableCell className="px-3 py-cell text-right text-body-sm font-medium text-foreground">{r.ratio === null ? "—" : `${r.ratio.toFixed(1)}×`}</TableCell>
              <TableCell className="hidden px-3 py-cell text-right text-body-sm text-foreground-2 sm:table-cell">{formatCrore(r.turnover)}</TableCell>
              <TableCell className={cn("py-cell pl-3 pr-card-x text-right text-body-sm font-medium", r.changePct === null ? "text-muted-foreground" : r.changePct >= 0 ? "text-up" : "text-down")}>
                {r.changePct === null ? "—" : `${signed(r.changePct, 1)}%`}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
