import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { MemberRow } from "@/query/breadth";

type Props = { title: string; rows: MemberRow[]; tone: "up" | "down"; maLabel: string };

/** Within this distance of the average, a name is one session from flipping. */
const NEAR = 2;

export default function MemberTable({ title, rows, tone, maLabel }: Props) {
  const toneClass = tone === "up" ? "text-signal-up" : "text-signal-down";

  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-baseline justify-between border-b px-4 py-3">
        <h2 className="flex items-baseline gap-2 text-sm font-medium">
          <span
            aria-hidden="true"
            className={cn("size-2 rounded-sm", tone === "up" ? "bg-signal-up" : "bg-signal-down")}
          />
          {title} {maLabel}
        </h2>
        <span className="font-mono text-xs text-muted-foreground">{rows.length}</span>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-sm text-muted-foreground">
          No constituents on this side of the line.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-9 text-xs font-normal text-muted-foreground">Symbol</TableHead>
              <TableHead className="h-9 text-right text-xs font-normal text-muted-foreground">Close</TableHead>
              <TableHead className="h-9 text-right text-xs font-normal text-muted-foreground">Average</TableHead>
              <TableHead className="h-9 text-right text-xs font-normal text-muted-foreground">Distance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const near = Math.abs(r.pctFromMa) <= NEAR;
              return (
                <TableRow key={r.symbol} className={cn(near && "bg-muted/60")}>
                  <TableCell className="py-2 font-medium">
                    {r.symbol}
                    {near && (
                      <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                        near the line
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-right font-mono text-xs">
                    {r.close.toFixed(2)}
                  </TableCell>
                  <TableCell className="py-2 text-right font-mono text-xs text-muted-foreground">
                    {r.ma.toFixed(2)}
                  </TableCell>
                  <TableCell className={cn("py-2 text-right font-mono text-xs", toneClass)}>
                    {r.pctFromMa >= 0 ? "+" : ""}
                    {r.pctFromMa.toFixed(2)}%
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
