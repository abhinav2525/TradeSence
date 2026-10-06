import { TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { sectorOf, shortSector } from "@/lib/sectors";

/** A table cell with NSE's sector, shortened; the full name on hover. Hidden on phones. */
export default function SectorCell({ symbol, className }: { symbol: string; className?: string }) {
  const s = sectorOf(symbol);
  return (
    <TableCell
      className={cn("hidden max-w-36 truncate px-3 py-cell text-body-sm text-muted-foreground sm:table-cell", className)}
      title={s ?? undefined}
    >
      {s ? shortSector(s) : "—"}
    </TableCell>
  );
}
