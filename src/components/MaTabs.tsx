import Link from "next/link";
import { cn } from "@/lib/utils";
import { MA_LABELS, type MaKind } from "@/query/breadth";

const ORDER: MaKind[] = ["sma200", "ema200", "sma50"];

type Props = { base: "/" | "/crossings"; ma: MaKind; date?: string };

export default function MaTabs({ base, ma, date }: Props) {
  return (
    <div className="flex flex-wrap gap-1" role="tablist" aria-label="Moving average">
      {ORDER.map((k, i) => (
        <Link
          key={k}
          href={`${base}?ma=${k}${date ? `&date=${date}` : ""}`}
          prefetch
          role="tab"
          aria-selected={k === ma}
          className={cn(
            "flex items-baseline gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors",
            k === ma
              ? "border-foreground/25 bg-accent text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {MA_LABELS[k]}
          <kbd className="font-mono text-[10px] opacity-50">{i + 1}</kbd>
        </Link>
      ))}
    </div>
  );
}
