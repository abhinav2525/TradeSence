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
import { GLOSSARY } from "@/lib/glossary";
import { sectorOf, shortSector } from "@/lib/sectors";
import SectorCell from "@/components/SectorCell";

const head = "h-row-head px-3 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground";
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
  const needle = q.trim().toUpperCase();
  const shown = needle
    ? rows.filter((r) => {
        const s = sectorOf(r.symbol);
        return r.symbol.includes(needle) || (s !== null && (s.toUpperCase().includes(needle) || shortSector(s).toUpperCase().includes(needle)));
      })
    : rows;
  const side = view === "below" ? "Above" : "Below";

  return (
    <div>
      {rows.length > 0 && (
      <div className="flex items-center justify-end px-card-x pb-3">
        <label htmlFor="symbol-filter" className="sr-only">Filter by symbol or sector</label>
        <input
          id="symbol-filter"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Symbol or sector"
          className="h-8 w-40 rounded-[8px] border border-input bg-transparent px-2.5 font-mono text-[12px] uppercase text-foreground placeholder:normal-case placeholder:text-muted-foreground"
        />
      </div>
      )}
      {shown.length === 0 ? (
        <p className="px-card-x pb-8 pt-2 text-body-sm text-muted-foreground">{q ? `No symbol or sector matches “${q}”.` : empty}</p>
      ) : (
        <Table containerClassName="max-h-[560px] overflow-y-auto" className="tabular-nums">
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(head, "pl-card-x")}>Symbol</TableHead>
              <TableHead className={cn(head, "hidden sm:table-cell")} title={GLOSSARY.sector.short}>Sector</TableHead>
              <TableHead className={cn(head, "text-right")}>Close</TableHead>
              <TableHead className={cn(head, "hidden text-right sm:table-cell")}>Day</TableHead>
              <TableHead className={cn(head, "hidden text-right sm:table-cell")}>{maLabel}</TableHead>
              <TableHead className={cn(head, "text-right")}>{view === "near" ? "Gap now" : view === "above" ? "Above by" : "Below by"}</TableHead>
              <TableHead className={cn(head, "text-right")} title={GLOSSARY["volume-ratio"].short}>Volume vs 20d</TableHead>
              <TableHead className={cn(head, "hidden text-right md:table-cell")}>
                {view === "near" ? "5 sessions ago" : `${side} for`}
              </TableHead>
              <TableHead className={cn(head, "hidden pr-card-x md:table-cell")} title={GLOSSARY.whipsaw.short}>Past crossings</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r) => (
              <TableRow key={r.symbol} className="hover:bg-raised">
                <TableCell className="py-cell pl-card-x pr-3 text-body-sm font-semibold text-foreground"><Link href={`/stock/${encodeURIComponent(r.symbol)}`} prefetch={false} className="hover:underline">{r.symbol}</Link></TableCell>
                <SectorCell symbol={r.symbol} />
                <TableCell className="px-3 py-cell text-right text-body-sm text-foreground">{formatPrice(r.close)}</TableCell>
                <TableCell
                  className={cn(
                    "hidden px-3 py-cell text-right text-body-sm sm:table-cell",
                    r.changePct === null ? "text-muted-foreground" : r.changePct > 0 ? "text-up" : r.changePct < 0 ? "text-down" : "text-muted-foreground",
                  )}
                >
                  {pctText(r.changePct)}
                </TableCell>
                <TableCell className="hidden px-3 py-cell text-right text-body-sm text-muted-foreground sm:table-cell">
                  {r.ma === null ? "—" : formatPrice(r.ma)}
                </TableCell>
                <TableCell
                  className={cn(
                    "px-3 py-cell text-right text-body-sm font-medium",
                    (r.pctFromMa ?? 0) > 0 ? "text-up" : "text-down",
                  )}
                >
                  {pctText(r.pctFromMa)}
                </TableCell>
                <TableCell className="px-3 py-cell text-right text-body-sm text-foreground">
                  <VolumeTrack ratio={r.volRatio} />
                </TableCell>
                <TableCell className="hidden px-3 py-cell text-right text-body-sm text-foreground-2 md:table-cell">
                  {view === "near"
                    ? pctText(r.gap5)
                    : r.runBefore === null ? "—" : `${r.runBefore} ${r.runBefore === 1 ? "session" : "sessions"}`}
                </TableCell>
                <TableCell className="hidden py-cell pl-3 pr-card-x text-body-sm md:table-cell">
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
