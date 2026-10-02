"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import VolumeTrack from "@/components/VolumeTrack";
import { formatPrice, signed } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ScreenerRow } from "@/query/screener";

const head = "h-9 px-3 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground";
const pctText = (v: number | null) => (v === null ? "—" : `${signed(v, 2)}%`);

type Props = {
  rows: ScreenerRow[];
  view: "above" | "below" | "near";
  maLabel: string;
  empty: string;
};

/** The main list. Client-side only so the symbol filter responds as you type. */
export default function ScreenerTable({ rows, view, maLabel, empty }: Props) {
  const [q, setQ] = useState("");
  const shown = q ? rows.filter((r) => r.symbol.includes(q.trim().toUpperCase())) : rows;
  const side = view === "below" ? "Above" : "Below";

  return (
    <div>
      {rows.length > 0 && (
      <div className="flex items-center justify-end px-5 pb-3">
        <label htmlFor="symbol-filter" className="sr-only">Filter by symbol</label>
        <input
          id="symbol-filter"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter symbol"
          className="h-8 w-40 rounded-[8px] border border-input bg-transparent px-2.5 font-mono text-[12px] uppercase text-foreground placeholder:normal-case placeholder:text-muted-foreground"
        />
      </div>
      )}
      {shown.length === 0 ? (
        <p className="px-5 pb-8 pt-2 text-[13px] text-muted-foreground">{q ? `No symbol matches “${q}”.` : empty}</p>
      ) : (
        <Table containerClassName="max-h-[560px] overflow-y-auto" className="tabular-nums">
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(head, "pl-5")}>Symbol</TableHead>
              <TableHead className={cn(head, "text-right")}>Close</TableHead>
              <TableHead className={cn(head, "hidden text-right sm:table-cell")}>Day</TableHead>
              <TableHead className={cn(head, "hidden text-right sm:table-cell")}>{maLabel}</TableHead>
              <TableHead className={cn(head, "text-right")}>{view === "near" ? "Gap now" : view === "above" ? "Above by" : "Below by"}</TableHead>
              <TableHead className={cn(head, "text-right")}>Volume vs 20d</TableHead>
              <TableHead className={cn(head, "hidden text-right md:table-cell")}>
                {view === "near" ? "5 sessions ago" : `${side} for`}
              </TableHead>
              <TableHead className={cn(head, "hidden pr-5 md:table-cell")}>Past crossings</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r) => (
              <TableRow key={r.symbol} className="hover:bg-raised">
                <TableCell className="py-2.5 pl-5 pr-3 text-[13px] font-semibold text-foreground"><Link href={`/stock/${encodeURIComponent(r.symbol)}`} prefetch={false} className="hover:underline">{r.symbol}</Link></TableCell>
                <TableCell className="px-3 py-2.5 text-right text-[13px] text-foreground">{formatPrice(r.close)}</TableCell>
                <TableCell
                  className={cn(
                    "hidden px-3 py-2.5 text-right text-[13px] sm:table-cell",
                    r.changePct === null ? "text-muted-foreground" : r.changePct > 0 ? "text-up" : r.changePct < 0 ? "text-down" : "text-muted-foreground",
                  )}
                >
                  {pctText(r.changePct)}
                </TableCell>
                <TableCell className="hidden px-3 py-2.5 text-right text-[13px] text-muted-foreground sm:table-cell">
                  {r.ma === null ? "—" : formatPrice(r.ma)}
                </TableCell>
                <TableCell
                  className={cn(
                    "px-3 py-2.5 text-right text-[13px] font-medium",
                    (r.pctFromMa ?? 0) > 0 ? "text-up" : "text-down",
                  )}
                >
                  {pctText(r.pctFromMa)}
                </TableCell>
                <TableCell className="px-3 py-2.5 text-right text-[13px] text-foreground">
                  <VolumeTrack ratio={r.volRatio} />
                </TableCell>
                <TableCell className="hidden px-3 py-2.5 text-right text-[13px] text-foreground-2 md:table-cell">
                  {view === "near"
                    ? pctText(r.gap5)
                    : r.runBefore === null ? "—" : `${r.runBefore} ${r.runBefore === 1 ? "session" : "sessions"}`}
                </TableCell>
                <TableCell className="hidden py-2.5 pl-3 pr-5 text-[13px] md:table-cell">
                  {r.pastCrossings === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <span className="w-6 text-right text-foreground">{r.pastCrossings}</span>
                      {r.badge && <Badge variant={r.badge === "Typical" ? "outline" : "neutral"}>{r.badge}</Badge>}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
