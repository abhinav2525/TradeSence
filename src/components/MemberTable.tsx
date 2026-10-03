import Link from "next/link";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MemberRow } from "@/query/breadth";
import Term from "@/components/Term";

type Props = {
  title: string;
  rows: MemberRow[];
  tone: "up" | "down";
  maLabel: string;
  className?: string;
};

/** Within this distance of the average, a name is one session from flipping. */
const NEAR = 2;

const head = "h-9 px-3 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground";

export default function MemberTable({ title, rows, tone, maLabel, className }: Props) {
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.pctFromMa)), 1);

  return (
    <Card className={cn("flex min-h-[240px] flex-col overflow-hidden", className)}>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className={cn("size-2 rounded-full", tone === "up" ? "bg-up" : "bg-down")}
          />
          <h2 className="text-heading text-foreground">
            {title} <Term id="ma-50-200">{maLabel}</Term>
          </h2>
        </div>
        <Badge variant={tone}>
          {rows.length} {rows.length === 1 ? "stock" : "stocks"}
        </Badge>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-10 text-body-sm text-muted-foreground">
          No constituents on this side of the line.
        </p>
      ) : (
        <Table containerClassName="max-h-[520px] overflow-y-auto" className="tabular-nums">
          {/* sticky so the column names survive scrolling */}
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(head, "pl-5")}>Symbol</TableHead>
              <TableHead className={cn(head, "text-right")}>Close</TableHead>
              <TableHead className={cn(head, "hidden text-right sm:table-cell")}>Average</TableHead>
              <TableHead className={cn(head, "pr-5 text-right")}>Distance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const near = Math.abs(r.pctFromMa) <= NEAR;
              return (
                <TableRow key={r.symbol} className="hover:bg-raised">
                  <TableCell className="py-2.5 pl-5 pr-3">
                    <span className="text-body-sm font-semibold text-foreground"><Link href={`/stock/${encodeURIComponent(r.symbol)}`} prefetch={false} className="hover:underline">{r.symbol}</Link></span>
                    {near && (
                      <Badge variant="outline" className="ml-2 align-middle" title={`Within ${NEAR}% of the average`}>
                        near line
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-right text-body-sm text-foreground">
                    {formatPrice(r.close)}
                  </TableCell>
                  <TableCell className="hidden px-3 py-2.5 text-right text-body-sm text-muted-foreground sm:table-cell">
                    {formatPrice(r.ma)}
                  </TableCell>
                  <TableCell className="py-2.5 pl-3 pr-5">
                    <div className="flex items-center justify-end gap-2.5">
                      <span className="hidden h-1.5 w-14 justify-end overflow-hidden rounded-full bg-chart-muted sm:flex" aria-hidden="true">
                        <span
                          className={cn("grow-x-end h-full rounded-full", tone === "up" ? "bg-up" : "bg-down")}
                          style={{ width: `${Math.max(4, (Math.abs(r.pctFromMa) / maxAbs) * 100)}%` }}
                        />
                      </span>
                      <span
                        className={cn(
                          "w-16 text-right text-body-sm font-medium",
                          tone === "up" ? "text-up" : "text-down",
                        )}
                      >
                        {r.pctFromMa >= 0 ? "+" : "−"}
                        {Math.abs(r.pctFromMa).toFixed(2)}%
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
