import { cn } from "@/lib/utils";

/** Volume against its 20-session normal on a 0–4× track, with a hairline at 2×. */
export default function VolumeTrack({ ratio, className }: { ratio: number | null; className?: string }) {
  if (ratio === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("inline-flex items-center justify-end gap-2.5", className)}>
      <span className="relative hidden h-1.5 w-16 overflow-hidden rounded-full bg-chart-muted sm:block" aria-hidden="true">
        <span className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${Math.min(100, (ratio / 4) * 100)}%` }} />
        <span className="absolute inset-y-0 left-1/2 w-px bg-foreground/60" />
      </span>
      <span className="w-10 text-right">{ratio.toFixed(1)}×</span>
    </span>
  );
}
