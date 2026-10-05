import Link from "next/link";
import { cn } from "@/lib/utils";
import SlidingPill from "@/components/SlidingPill";
import { INDICES, uParam, type IndexEntry } from "@/ingest/indices";

type Props = {
  base: "/advance-decline" | "/crossings" | "/screener";
  current: IndexEntry;
  ma: string;
  date?: string;
  /** Other already-validated params to keep when switching index, e.g. "&view=below". */
  extra?: string;
};

/**
 * Which index the page counts (decision 0034): NIFTY 50 or Nifty Bank, each on its
 * real membership day by day. Same look as MaTabs; the choice lives in `u`.
 */
export default function IndexTabs({ base, current, ma, date, extra = "" }: Props) {
  return (
    <div className="seg relative inline-flex items-center gap-0.5 rounded-md border bg-raised p-0.5" role="tablist" aria-label="Index">
      <SlidingPill active={current.key} />
      {INDICES.map((ix) => {
        const active = ix.key === current.key;
        return (
          <Link
            key={ix.key}
            href={`${base}?ma=${ma}${date ? `&date=${date}` : ""}${uParam(ix)}${extra}`}
            prefetch
            role="tab"
            aria-selected={active}
            className={cn(
              "inline-flex h-8 items-center rounded-[8px] px-3 text-body-sm font-medium transition-colors",
              active ? "bg-thumb text-foreground shadow-thumb" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {ix.label}
          </Link>
        );
      })}
    </div>
  );
}
