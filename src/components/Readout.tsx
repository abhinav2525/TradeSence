import { cn } from "@/lib/utils";

type Cell = {
  value: string;
  label: string;
  /** 0-1, drawn as a small fill bar under the value when present. */
  fill?: number;
  tone?: "up" | "down" | "neutral";
  hint?: string;
};

/**
 * The dense reading row. Four measurements at once, because a breadth number
 * alone is not decidable — you need to know how rare it is and which way it is
 * moving before it means anything.
 */
export default function Readout({ cells, cols = 4 }: { cells: Cell[]; cols?: 3 | 4 }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border",
        cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-4",
      )}
    >
      {cells.map((c) => (
        <div key={c.label} className="bg-card px-4 py-3.5">
          <div
            className={cn(
              "font-mono text-3xl leading-none tracking-tight",
              c.tone === "up" && "text-signal-up",
              c.tone === "down" && "text-signal-down",
            )}
          >
            {c.value}
          </div>
          <div className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{c.label}</div>
          {c.fill !== undefined && (
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full",
                  c.tone === "down" ? "bg-signal-down" : "bg-signal-up",
                )}
                style={{ width: `${Math.max(2, Math.min(100, c.fill * 100))}%` }}
              />
            </div>
          )}
          {c.hint && <div className="mt-1.5 font-mono text-[10px] text-muted-foreground">{c.hint}</div>}
        </div>
      ))}
    </div>
  );
}
