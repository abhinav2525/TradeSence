import Link from "next/link";
import { cn } from "@/lib/utils";
import { MA_LABELS, type MaKind } from "@/lib/ma";
import SlidingPill from "@/components/SlidingPill";

const ORDER: MaKind[] = ["sma200", "ema200", "sma50"];

type Props = {
  base: "/" | "/crossings" | "/screener";
  ma: MaKind;
  date?: string;
  /** Other already-validated params to keep when switching average, e.g. "&view=below". */
  extra?: string;
};

/** A segmented control: the selected average sits on a raised thumb. */
export default function MaTabs({ base, ma, date, extra = "" }: Props) {
  return (
    <div
      className="seg relative inline-flex items-center gap-0.5 rounded-md border bg-raised p-0.5"
      role="tablist"
      aria-label="Moving average"
    >
      <SlidingPill active={ma} />
      {ORDER.map((k, i) => {
        const active = k === ma;
        return (
          <Link
            key={k}
            href={`${base}?ma=${k}${date ? `&date=${date}` : ""}${extra}`}
            prefetch
            role="tab"
            aria-selected={active}
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-[8px] px-3 text-body-sm font-medium transition-colors",
              active ? "bg-thumb text-foreground shadow-thumb" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {MA_LABELS[k]}
            <kbd className="hidden font-mono text-[10px] text-muted-foreground sm:inline">{i + 1}</kbd>
          </Link>
        );
      })}
    </div>
  );
}
