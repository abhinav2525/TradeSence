import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import DatePicker from "@/components/DatePicker";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  /** The page whose sessions this steps through. */
  base?: string;
  /** Other already-validated params to keep when moving, e.g. "&view=below". */
  extra?: string;
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

export default function DateNav({ base = "/", extra = "", ma, date, requested, snapped, prev, next, min, max }: Props) {
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
        href={`${base}?ma=${ma}&date=${target}${extra}`}
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

        <DatePicker base={base} ma={ma} date={date} min={min} max={max} extra={extra} />

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
