"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { termHref, type TermId, type Topic } from "@/lib/glossary";

type Item = { id: TermId; term: string; topic: Topic; short: string };

/** Every glossary term, grouped by topic, with a filter that matches the name or the definition. */
export default function LearnList({ entries, topics }: { entries: Item[]; topics: Topic[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? entries.filter((e) => e.term.toLowerCase().includes(needle) || e.short.toLowerCase().includes(needle))
    : entries;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <label htmlFor="learn-filter" className="sr-only">Filter terms</label>
        <input
          id="learn-filter"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter terms"
          className="h-9 w-64 rounded-[8px] border border-input bg-transparent px-3 text-body-sm text-foreground placeholder:text-muted-foreground"
        />
      </div>
      {shown.length === 0 && <p className="text-body-sm text-muted-foreground">No term matches “{q}”.</p>}
      {topics.map((t) => {
        const list = shown.filter((e) => e.topic === t);
        if (list.length === 0) return null;
        return (
          <Card key={t} className="px-card-x py-card">
            <h2 className="text-heading text-foreground">{t}</h2>
            <ul className="mt-3 grid gap-1 md:grid-cols-2">
              {list.map((e) => (
                <li key={e.id}>
                  <Link href={termHref(e.id)} className="block rounded-md px-3 py-2.5 transition-colors hover:bg-raised">
                    <span className="text-body-sm font-medium text-foreground">{e.term}</span>
                    <span className="mt-0.5 block text-[12px] leading-4 text-foreground-2">{e.short}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
