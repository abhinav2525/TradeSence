import Link from "next/link";
import { signed } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SectorFlow } from "@/indicators/money-flow";

const NOISE = 1e-9; // NOISE_PCT: a median move this close to 0 is flat
const tone = (m: number | null) => (m === null || Math.abs(m) <= NOISE ? "flat" : m > 0 ? "up" : "down");
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

/**
 * One row per sector: trading vs its own normal on a shared track with a hairline
 * at 1×, coloured by which way its stocks moved. Each row opens the sector's stocks.
 */
export default function FlowBars({ sectors, selected, hrefFor }: {
  sectors: SectorFlow[]; selected: string | null; hrefFor: (sector: string) => string;
}) {
  const max = Math.max(1.5, ...sectors.map((s) => s.ratio ?? 0));
  const one = (1 / max) * 100;
  return (
    <ul className="divide-y" aria-label="Sectors by trading against their normal">
      {sectors.map((s) => {
        const t = tone(s.medianMove);
        return (
          <li key={s.sector}>
            <Link href={hrefFor(s.sector)} prefetch={false} aria-current={selected === s.sector ? "true" : undefined}
              className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-card-x py-cell text-body-sm transition-colors hover:bg-raised sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_4rem_7.5rem_5rem]",
                selected === s.sector && "bg-raised")}>
              <span className="truncate font-medium text-foreground">{s.sector}</span>
              <span className="relative col-span-2 row-start-2 h-2 overflow-hidden rounded-full bg-chart-muted sm:col-span-1 sm:row-start-auto" aria-hidden="true">
                {s.ratio !== null && (
                  <span className={cn("grow-x absolute inset-y-0 left-0 rounded-full", t === "up" ? "bg-up" : t === "down" ? "bg-down" : "bg-muted-foreground")}
                    style={{ width: `${Math.min(100, (s.ratio / max) * 100)}%` }} />
                )}
                <span className="fade-in absolute inset-y-0 w-px bg-foreground/70" style={{ left: `${one}%` }} />
              </span>
              <span className="text-right font-semibold tabular-nums text-foreground">
                {s.ratio === null ? "—" : `${s.ratio.toFixed(2)}×`}
                {/* phones: the move beside the ×, so direction is never colour alone */}
                <span className={cn("ml-2 font-normal sm:hidden", t === "up" ? "text-up" : t === "down" ? "text-down" : "text-muted-foreground")}>
                  {s.medianMove === null ? "" : `${signed(s.medianMove, 1)}%`}
                </span>
              </span>
              <span className="hidden text-right tabular-nums text-foreground-2 sm:block">
                {pct(s.share)} <span className="text-muted-foreground">({pct(s.usualShare)})</span>
              </span>
              <span className={cn("hidden text-right tabular-nums sm:block", t === "up" ? "text-up" : t === "down" ? "text-down" : "text-muted-foreground")}>
                {s.medianMove === null ? "—" : `${signed(s.medianMove, 1)}%`}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
