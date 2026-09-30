import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { CrossingStat } from "@/query/crossings";

type Props = { rows: CrossingStat[]; maLabel: string };

export default function CrossingsTable({ rows, maLabel }: Props) {
  if (rows.length === 0) {
    return <p className="px-4 py-8 text-sm text-muted-foreground">No data yet.</p>;
  }
  const busiest = rows[0]!.crossings || 1;

  return (
    <Table containerClassName="min-h-0 flex-1 overflow-y-auto">
      {/* sticky so the column names survive scrolling */}
      <TableHeader className="sticky top-0 z-10 bg-card">
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-9 text-xs font-normal text-muted-foreground">Symbol</TableHead>
          <TableHead className="h-9 text-right text-xs font-normal text-muted-foreground">Crossings</TableHead>
          <TableHead className="h-9 text-xs font-normal text-muted-foreground">Relative</TableHead>
          <TableHead className="h-9 text-right text-xs font-normal text-muted-foreground">Avg run</TableHead>
          <TableHead className="h-9 text-xs font-normal text-muted-foreground">Now</TableHead>
          <TableHead className="h-9 text-right text-xs font-normal text-muted-foreground">Sessions in run</TableHead>
          <TableHead className="h-9 text-right text-xs font-normal text-muted-foreground">Last crossed</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.symbol}>
            <TableCell className="py-2 font-medium">{r.symbol}</TableCell>
            <TableCell className="py-2 text-right font-mono text-xs">{r.crossings}</TableCell>
            <TableCell className="py-2">
              {/* width carries the comparison; the number beside it carries the value */}
              <span
                aria-hidden="true"
                className="block h-1.5 w-full max-w-[140px] overflow-hidden rounded-full bg-muted"
              >
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(2, Math.round((r.crossings / busiest) * 100))}%` }}
                />
              </span>
            </TableCell>
            <TableCell className="py-2 text-right font-mono text-xs text-muted-foreground">
              {r.avgDaysPerRun ? `${r.avgDaysPerRun.toFixed(0)}d` : "—"}
            </TableCell>
            <TableCell
              className={cn(
                "py-2 text-xs",
                r.currentState === "above" ? "text-signal-up" : "text-signal-down",
              )}
            >
              {r.currentState} {maLabel}
            </TableCell>
            <TableCell className="py-2 text-right font-mono text-xs">{r.daysInCurrentRun}</TableCell>
            <TableCell className="py-2 text-right font-mono text-xs text-muted-foreground">
              {r.lastCrossing ?? "never"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
