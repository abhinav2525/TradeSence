import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Term from "@/components/Term";
import { formatCrore, formatShares, signed } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LeaderRow, RankBy, SizeGroup } from "@/query/volume";

export const SIZE_LABEL: Record<SizeGroup, string> = { large: "Large", mid: "Mid", small: "Small", micro: "Micro" };
const head = "h-row-head px-3 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground";

/** The leaderboard. The ranked measure is bold; NIFTY 50 Report Cards are linked where one exists. */
export default function VolumeTable({ rows, rank, period, empty }: { rows: LeaderRow[]; rank: RankBy; period: number; empty: string }) {
  if (rows.length === 0) return <p className="px-card-x py-8 text-body-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="max-h-[560px] overflow-auto">
      <Table className="tabular-nums">
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(head, "w-10 pl-card-x")}>#</TableHead>
            <TableHead className={head}>Stock</TableHead>
            <TableHead className={cn(head, "hidden md:table-cell")}><Term id="nse-sector">Sector</Term></TableHead>
            <TableHead className={cn(head, "hidden sm:table-cell")}><Term id="size-group">Size</Term></TableHead>
            <TableHead className={cn(head, "text-right")}><Term id="value-traded">₹ traded</Term></TableHead>
            <TableHead className={cn(head, "hidden text-right sm:table-cell")}>Shares</TableHead>
            <TableHead className={cn(head, "pr-card-x text-right md:pr-3")}>Price</TableHead>
            <TableHead className={cn(head, "hidden pr-card-x text-right md:table-cell")}><Term id="unusual-activity">Unusual days</Term></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.symbol} className="hover:bg-raised">
              <TableCell className="py-cell pl-card-x pr-2 text-body-sm text-muted-foreground">{i + 1}</TableCell>
              <TableCell className="px-3 py-cell text-body-sm">
                <span className="font-semibold text-foreground">
                  {r.hasCard ? (
                    <Link href={`/stock/${encodeURIComponent(r.symbol)}`} prefetch={false} className="hover:underline">{r.symbol}</Link>
                  ) : r.symbol}
                </span>
                {r.sessions < period && (
                  <span className="block text-[11px] text-muted-foreground">{r.sessions} of {period} sessions</span>
                )}
              </TableCell>
              <TableCell className="hidden px-3 py-cell text-body-sm text-foreground-2 md:table-cell">{r.sector}</TableCell>
              <TableCell className="hidden px-3 py-cell sm:table-cell">
                {r.size ? <Badge variant="neutral">{SIZE_LABEL[r.size]}</Badge> : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell className={cn("px-3 py-cell text-right text-body-sm", rank === "value" ? "font-semibold text-foreground" : "text-foreground-2")}>
                {formatCrore(r.turnover)}
              </TableCell>
              <TableCell className={cn("hidden px-3 py-cell text-right text-body-sm sm:table-cell", rank === "shares" ? "font-semibold text-foreground" : "text-foreground-2")}>
                {formatShares(r.shares)}
              </TableCell>
              <TableCell className={cn("py-cell pl-3 pr-card-x text-right text-body-sm font-medium md:pr-3", r.changePct === null ? "text-muted-foreground" : r.changePct >= 0 ? "text-up" : "text-down")}>
                {r.changePct === null ? "—" : `${signed(r.changePct, 1)}%`}
              </TableCell>
              <TableCell className="hidden py-cell pl-3 pr-card-x text-right text-body-sm text-foreground-2 md:table-cell">
                {r.unusualDays || "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
