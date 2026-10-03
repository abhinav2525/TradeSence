"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/card";

type Stock = { symbol: string; current: boolean };

/** Every supported stock as a link, current members first, with a filter box. */
export default function StockList({ stocks }: { stocks: Stock[] }) {
  const [q, setQ] = useState("");
  const shown = q ? stocks.filter((s) => s.symbol.includes(q.trim().toUpperCase())) : stocks;
  const group = (title: string, list: Stock[]) =>
    list.length > 0 && (
      <Card className="p-5">
        <h2 className="text-heading text-foreground">{title}</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{list.length} stocks</p>
        <ul className="mt-4 grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-6">
          {list.map((s) => (
            <li key={s.symbol}>
              <Link
                href={`/stock/${encodeURIComponent(s.symbol)}`}
                prefetch={false}
                className="block rounded-md px-2.5 py-1.5 text-body-sm font-medium text-foreground-2 transition-colors hover:bg-raised hover:text-foreground"
              >
                {s.symbol}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    );
  return (
    <div className="flex flex-col gap-4">
      <div>
        <label htmlFor="stock-filter" className="sr-only">Filter by symbol</label>
        <input
          id="stock-filter"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter symbol"
          className="h-9 w-56 rounded-[8px] border border-input bg-transparent px-3 font-mono text-body-sm uppercase text-foreground placeholder:normal-case placeholder:text-muted-foreground"
        />
      </div>
      {shown.length === 0 && <p className="text-body-sm text-muted-foreground">No symbol matches “{q}”.</p>}
      {group("In the NIFTY 50", shown.filter((s) => s.current))}
      {group("Former members since 2020", shown.filter((s) => !s.current))}
    </div>
  );
}
