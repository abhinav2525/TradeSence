import Link from "next/link";
import { signed } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BUSY_SECTOR_FEW, shownRatio, type SectorFlow } from "@/indicators/money-flow";

const NOISE = 1e-9; // NOISE_PCT: a median move this close to 0 is flat
const tone = (m: number | null) => (m === null || Math.abs(m) <= NOISE ? "flat" : m > 0 ? "up" : "down");
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

/** Sector columns, shared with the page's header row so they line up. */
export const FLOW_COLS = "sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_5rem_7.5rem_5rem]";

/**
 * One row per sector: trading vs its own normal on a shared track with a hairline
 * at 1×, coloured by which way its stocks moved, and how many of its stocks were
 * busier than their own normal. With `hideLoudest` the bar is the sector without
 * its loudest stock (named), the full figure kept in small text. Each row opens the sector's stocks.
 */
export default function FlowBars({ sectors, selected, hrefFor, hideLoudest = false }: {
  sectors: SectorFlow[]; selected: string | null; hrefFor: (sector: string) => string; hideLoudest?: boolean;
}) {
  const max = Math.max(1.5, ...sectors.map((s) => shownRatio(s, hideLoudest) ?? 0));
  const one = (1 / max) * 100;
  return (
    <ul className="divide-y" aria-label="Sectors by trading against their normal">
      {sectors.map((s) => {
        const t = tone(s.medianMove);
        const r = shownRatio(s, hideLoudest);
        const note = !hideLoudest ? null
          : !s.loudest ? "no stock above its normal"
          : `without ${s.loudest}${s.counted <= BUSY_SECTOR_FEW ? " · few stocks" : ""}`;
        return (
          <li key={s.sector}>
            <Link href={hrefFor(s.sector)} prefetch={false} aria-current={selected === s.sector ? "true" : undefined}
              className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-card-x py-cell text-body-sm transition-colors hover:bg-raised", FLOW_COLS,
                selected === s.sector && "bg-raised")}>
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">{s.sector}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {s.busier} of {s.counted} busier{note ? ` · ${note}` : ""}
                </span>
              </span>
              <span className="relative col-span-2 row-start-2 h-2 overflow-hidden rounded-full bg-chart-muted sm:col-span-1 sm:row-start-auto" aria-hidden="true">
                {r !== null && (
                  <span className={cn("grow-x absolute inset-y-0 left-0 rounded-full", t === "up" ? "bg-up" : t === "down" ? "bg-down" : "bg-muted-foreground")}
                    style={{ width: `${Math.min(100, (r / max) * 100)}%` }} />
                )}
                <span className="fade-in absolute inset-y-0 w-px bg-foreground/70" style={{ left: `${one}%` }} />
              </span>
              <span className="text-right font-semibold tabular-nums text-foreground">
                {r === null ? "—" : `${r.toFixed(2)}×`}
                {/* phones: the move beside the ×, so direction is never colour alone */}
                <span className={cn("ml-2 font-normal sm:hidden", t === "up" ? "text-up" : t === "down" ? "text-down" : "text-muted-foreground")}>
                  {s.medianMove === null ? "" : `${signed(s.medianMove, 1)}%`}
                </span>
                {hideLoudest && s.loudest && s.ratio !== null && (
                  <span className="block whitespace-nowrap text-[11px] font-normal text-muted-foreground">{s.ratio.toFixed(2)}× with it</span>
                )}
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
