import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  ma: string;
  date: string | null;
  requested: string | null;
  snapped: boolean;
  prev: string | null;
  next: string | null;
  min: string | null;
  max: string | null;
};

const stepClass =
  "inline-flex size-8 items-center justify-center rounded-[8px] text-foreground-2 transition-colors";

export default function DateNav({ ma, date, requested, snapped, prev, next, min, max }: Props) {
  const step = (target: string | null, dir: "prev" | "next") => {
    const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
    const label = dir === "prev" ? "Previous session" : "Next session";
    if (!target) {
      return (
        <span
          aria-disabled="true"
          title={dir === "prev" ? "Start of history" : "Latest session"}
          className={cn(stepClass, "text-muted-foreground/40")}
        >
          <Icon className="size-4" />
        </span>
      );
    }
    return (
      <Link
        href={`/?ma=${ma}&date=${target}`}
        prefetch
        rel={dir}
        aria-label={label}
        title={`${label}: ${formatDate(target)}`}
        className={cn(stepClass, "hover:bg-raised hover:text-foreground")}
      >
        <Icon className="size-4" />
      </Link>
    );
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="inline-flex items-center gap-0.5 rounded-md border bg-card p-0.5 shadow-card">
        {step(prev, "prev")}

        {/* a plain GET form keeps this page a server component and puts the
            selected session in the URL, so a view can be bookmarked */}
        <form method="get" action="/" className="flex items-center gap-1">
          <input type="hidden" name="ma" value={ma} />
          <label htmlFor="date" className="sr-only">
            Session date
          </label>
          <input
            type="date"
            id="date"
            name="date"
            defaultValue={date ?? undefined}
            min={min ?? undefined}
            max={max ?? undefined}
            className="h-8 rounded-[8px] border border-input bg-transparent px-2 font-mono text-[12px] tabular-nums text-foreground"
          />
          <Button type="submit" size="sm" className="h-8 rounded-[8px] px-3">
            Go
          </Button>
        </form>

        {step(next, "next")}
      </div>

      {snapped && requested && (
        <p role="status" className="text-[12px] text-muted-foreground">
          {formatDate(requested)} was not a trading session. Showing {formatDate(date)}.
        </p>
      )}
    </div>
  );
}
