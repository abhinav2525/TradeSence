import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Term from "@/components/Term";
import type { TermId } from "@/lib/glossary";
import { cn } from "@/lib/utils";

type Tone = "up" | "down" | "neutral";

export type Tile = {
  label: string;
  /** Adds an ⓘ beside the label that explains it; the tile's value is its "today". */
  term?: TermId;
  value: string;
  /** Small trailing unit: "%", "pts". */
  unit?: string;
  /** One line under the value, in secondary ink. */
  sub?: string;
  /** Colours the value and adds an arrow. Only for values that ARE a direction. */
  direction?: "up" | "down";
  /** A small pill beside the label. */
  badge?: { text: string; tone: Tone };
  /** 0-1, drawn as a meter under the value. */
  fill?: number;
  fillTone?: Tone;
  /** A low-high band with today's position, all on 0-100. */
  range?: { lo: number; hi: number; now: number };
};

const toneBg: Record<Tone, string> = { up: "bg-up", down: "bg-down", neutral: "bg-brand" };

/**
 * Stat tiles. A breadth number alone is not decidable: you need to know how
 * rare it is and which way it is moving before it means anything, so these
 * ride beside the headline figure.
 */
export default function Readout({ tiles, className }: { tiles: Tile[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:gap-4", className)}>
      {tiles.map((t) => (
        <StatTile key={t.label} {...t} />
      ))}
    </div>
  );
}

function StatTile({ label, term, value, unit, sub, direction, badge, fill, fillTone = "neutral", range }: Tile) {
  const Arrow = direction === "up" ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="flex min-w-0 flex-col rounded-lg border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        {term ? (
          <p className="min-w-0 text-[12px] font-medium text-muted-foreground">
            <Term id={term} today={`${value}${unit ? (/^[%×]/.test(unit) ? unit : ` ${unit}`) : ""}`}>{label}</Term>
          </p>
        ) : (
          <p className="truncate text-[12px] font-medium text-muted-foreground">{label}</p>
        )}
        {badge && <Badge variant={badge.tone === "neutral" ? "neutral" : badge.tone}>{badge.text}</Badge>}
      </div>

      <div
        className={cn(
          "mt-3 flex items-baseline gap-1",
          direction === "up" && "text-up",
          direction === "down" && "text-down",
        )}
      >
        {direction && <Arrow className="size-5 self-center" aria-hidden="true" />}
        <span className="text-metric">{value}</span>
        {unit && <span className="text-[13px] font-medium opacity-70">{unit}</span>}
      </div>

      {fill !== undefined && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-chart-muted">
          <div
            className={cn("h-full rounded-full", toneBg[fillTone])}
            style={{ width: `${Math.max(2, Math.min(100, fill * 100))}%` }}
          />
        </div>
      )}

      {range && (
        <div className="relative mt-3 h-1.5 w-full rounded-full bg-chart-muted" aria-hidden="true">
          <div
            className="absolute inset-y-0 rounded-full bg-brand/45"
            style={{ left: `${range.lo}%`, width: `${Math.max(1, range.hi - range.lo)}%` }}
          />
          <div
            className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ring-2 ring-card"
            style={{ left: `${range.now}%` }}
          />
        </div>
      )}

      {sub && <p className="mt-auto pt-2.5 text-[12px] leading-4 text-foreground-2">{sub}</p>}
    </div>
  );
}
