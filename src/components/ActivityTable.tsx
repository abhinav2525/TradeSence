import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Term from "@/components/Term";
import { formatCrore, signed } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ActivityRow } from "@/query/activity";
import { KINDS, type Kind } from "@/indicators/activity";

export const KIND_LABEL: Record<Kind, string> = {
  kept: "Big keeping", volume: "Huge volume", jump: "Delivery jump", collapse: "Delivery collapse",
};
const head = "h-row-head px-3 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground";
const x = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}×`);

/** One row per unusual stock; NIFTY 50 members (on that date) link to their Report Card. */
export default function ActivityTable({ rows, empty }: { rows: ActivityRow[]; empty: string }) {
  if (rows.length === 0) return <p className="px-card-x py-8 text-body-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="max-h-[560px] overflow-auto">
      <Table className="tabular-nums">
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(head, "pl-card-x")}>Stock</TableHead>
            <TableHead className={head}>What was unusual</TableHead>
            <TableHead className={cn(head, "hidden text-right sm:table-cell")}><Term id="big-keeping">Kept vs normal</Term></TableHead>
            <TableHead className={cn(head, "hidden text-right sm:table-cell")}><Term id="huge-volume">Volume vs normal</Term></TableHead>
            <TableHead className={cn(head, "hidden text-right sm:table-cell")}><Term id="delivery-pct">Delivery % (usual)</Term></TableHead>
            <TableHead className={cn(head, "text-right")}>Price</TableHead>
            <TableHead className={cn(head, "hidden pr-card-x text-right md:table-cell")}>Traded</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.symbol} className="hover:bg-raised">
              <TableCell className="py-cell pl-card-x pr-3 text-body-sm font-semibold text-foreground">
                {r.member ? (
                  <Link href={`/stock/${encodeURIComponent(r.symbol)}`} prefetch={false} className="hover:underline">{r.symbol}</Link>
                ) : r.symbol}
              </TableCell>
              <TableCell className="px-3 py-cell">
                <div className="flex flex-wrap gap-1">
                  {KINDS.filter((k) => r[k]).map((k) => <Badge key={k} variant="neutral">{KIND_LABEL[k]}</Badge>)}
                </div>
              </TableCell>
              <TableCell className={cn("hidden px-3 py-cell text-right text-body-sm sm:table-cell", r.kept ? "font-semibold text-foreground" : "text-muted-foreground")}>{x(r.keptRatio)}</TableCell>
              <TableCell className={cn("hidden px-3 py-cell text-right text-body-sm sm:table-cell", r.volume ? "font-semibold text-foreground" : "text-muted-foreground")}>{x(r.volumeRatio)}</TableCell>
              <TableCell className={cn("hidden px-3 py-cell text-right text-body-sm sm:table-cell", r.jump || r.collapse ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {r.deliveryPct === null ? "—" : `${r.deliveryPct.toFixed(0)}%`}
                {r.usualDeliveryPct !== null && <span className="text-muted-foreground"> ({r.usualDeliveryPct.toFixed(0)}%)</span>}
              </TableCell>
              <TableCell className={cn("px-3 py-cell text-right text-body-sm font-medium", r.changePct === null ? "text-muted-foreground" : r.changePct >= 0 ? "text-up" : "text-down")}>
                {r.changePct === null ? "—" : `${signed(r.changePct, 1)}%`}
              </TableCell>
              <TableCell className="hidden py-cell pl-3 pr-card-x text-right text-body-sm text-foreground-2 md:table-cell">{formatCrore(r.turnover)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
