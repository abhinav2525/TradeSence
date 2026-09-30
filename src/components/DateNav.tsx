import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export default function DateNav({ ma, date, requested, snapped, prev, next, min, max }: Props) {
  const step = (target: string | null, dir: "prev" | "next") => {
    const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
    const label = dir === "prev" ? "Previous session" : "Next session";
    if (!target) {
      return (
        <span
          aria-disabled="true"
          title={dir === "prev" ? "Start of history" : "Latest session"}
          className="inline-flex size-8 items-center justify-center rounded-md border text-muted-foreground/40"
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
        title={`${label} — ${target}`}
        className="inline-flex size-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Icon className="size-4" />
      </Link>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        {step(prev, "prev")}
        {step(next, "next")}
      </div>

      {/* a plain GET form keeps this page a server component and puts the
          selected session in the URL, so a view can be bookmarked */}
      <form method="get" action="/" className="flex items-center gap-2">
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
          className="h-8 rounded-md border bg-card px-2 font-mono text-xs text-foreground"
        />
        <Button type="submit" variant="secondary" size="sm" className="h-8 text-xs">
          Show session
        </Button>
      </form>

      <p className="font-mono text-[11px] text-muted-foreground">
        <kbd className="rounded border px-1">←</kbd>{" "}
        <kbd className="rounded border px-1">→</kbd> to step
      </p>

      {snapped && requested && (
        <p role="status" className={cn("w-full text-xs text-muted-foreground")}>
          {requested} was not a trading session. Showing {date}.
        </p>
      )}
    </div>
  );
}
