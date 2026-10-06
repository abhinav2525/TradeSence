"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/card";

type Stock = { symbol: string };
export type StockGroup = { title: string; stocks: Stock[] };

/** Every supported stock as a link, in the groups the page gives (current members first), with a filter box. */
export default function StockList({ groups }: { groups: StockGroup[] }) {
  const [q, setQ] = useState("");
  const match = (list: Stock[]) => (q ? list.filter((s) => s.symbol.includes(q.trim().toUpperCase())) : list);
  const shownCount = groups.reduce((n, g) => n + match(g.stocks).length, 0);
  const group = (title: string, list: Stock[]) =>
    list.length > 0 && (
      <Card className="px-card-x py-card">
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
      {shownCount === 0 && <p className="text-body-sm text-muted-foreground">No symbol matches “{q}”.</p>}
      {groups.map((g) => <div key={g.title} className="contents">{group(g.title, match(g.stocks))}</div>)}
    </div>
  );
}
