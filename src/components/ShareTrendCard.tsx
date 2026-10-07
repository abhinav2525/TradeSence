import Link from "next/link";
import Term from "@/components/Term";
import ShareSpark from "@/components/ShareSpark";
import { Card, CardFooter } from "@/components/ui/card";
import { formatDate, formatDayMonth, signed } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MIN_SECTOR_STOCKS, NEW_LISTING_MARK, type ShareBlocks, type ShareTrend } from "@/indicators/money-flow";
import type { SharePoint } from "@/query/money-flow";

/** Sector · now · a year ago · change · each week. Phones keep sector, change and the small line. */
const COLS = "grid-cols-[minmax(0,1fr)_4.5rem_5.5rem] sm:grid-cols-[minmax(0,14rem)_4.5rem_5.5rem_5.5rem_minmax(0,1fr)] lg:grid-cols-[minmax(0,20rem)_4.5rem_5.5rem_5.5rem_minmax(0,1fr)]";
const colHead = "text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground";
const span = (from: string, to: string) => `${formatDayMonth(from)}–${formatDate(to)}`;

/** The change as shown (1 decimal); colour only for its sign, and none when it rounds to 0.0. */
function Change({ pts }: { pts: number | null }) {
  if (pts === null) return <span className="text-muted-foreground">—</span>;
  const shown = Number(pts.toFixed(1));
  return (
    <span className={cn("font-semibold tabular-nums", shown > 0 ? "text-up" : shown < 0 ? "text-down" : "text-muted-foreground")}>
      {signed(pts, 1)} pts
    </span>
  );
}

/**
 * Money flow's "Share of trading over a year" (decision 0041): each sector's slice of all ₹ traded by today's
 * Nifty Total Market stocks, the last 3 months against the same calendar 3 months a year ago, with its weekly
 * share as a small line. Doesn't depend on the page's period, so it shows on every tab.
 */
export default function ShareTrendCard({ trend, blocks, lines, hrefFor }: {
  trend: { rows: ShareTrend[]; small: { nowPct: number; agoPct: number | null } } | null;
  blocks: ShareBlocks | null;
  lines: Map<string, SharePoint[]>;
  hrefFor: (sector: string) => string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="px-card-x pb-2 pt-4">
        <h2 className="text-heading text-foreground">
          <Term id="share-of-trading-trend">Share of trading over a year</Term>
        </h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Each sector&apos;s slice of all ₹ traded by today&apos;s Nifty Total Market stocks: the last 3 months against the same 3 months a year ago. Two snapshots, not a trend line; the small line shows every week between.
        </p>
        {trend && blocks && (
          <p className="mt-2 text-[12px] text-foreground-2">
            Now: {span(blocks.nowFrom, blocks.nowTo)}. A year ago: {span(blocks.agoFrom, blocks.agoTo)}. A bigger slice says where trading went, not where prices go: heavy trading can be selling as much as buying.
          </p>
        )}
      </div>

      {!trend || !blocks ? (
        <p className="px-card-x pb-card text-body-sm text-foreground-2">
          Needs a year of history: this shows once the database holds the same 3 months a year ago.
        </p>
      ) : (
        <>
          <div className={cn("grid gap-x-4 border-b px-card-x pb-2", COLS, colHead)}>
            <span>Sector</span>
            <span className="hidden text-right sm:block"><Term id="share-of-trading">Now</Term></span>
            <span className="hidden text-right sm:block">A year ago</span>
            <span className="text-right"><Term id="share-of-trading-trend">Change</Term></span>
            <span>Each week</span>
          </div>
          <ul className="divide-y" aria-label="Sectors by change in share of trading over a year">
            {trend.rows.map((r) => (
              <li key={r.sector} className={cn("grid items-center gap-x-4 px-card-x py-cell text-body-sm", COLS)}>
                <span className="min-w-0">
                  <Link href={hrefFor(r.sector)} prefetch={false} className="block truncate font-medium text-foreground hover:underline">
                    {r.sector}
                  </Link>
                  {r.partlyNew && r.newListingPct !== null && (
                    <span className="block text-[11px] text-muted-foreground">
                      Partly <Term id="new-listing-share">new listings</Term>: {r.newListingPct.toFixed(0)}% of its recent trading is from stocks that weren&apos;t trading a year ago
                    </span>
                  )}
                  {/* phones: the two shares under the name, since their columns are hidden */}
                  <span className="block text-[11px] tabular-nums text-muted-foreground sm:hidden">
                    {r.agoPct === null ? "—" : `${r.agoPct.toFixed(1)}%`} → {r.nowPct.toFixed(1)}%
                  </span>
                </span>
                <span className="hidden text-right tabular-nums text-foreground sm:block">{r.nowPct.toFixed(1)}%</span>
                <span className="hidden text-right tabular-nums text-foreground-2 sm:block">{r.agoPct === null ? "—" : `${r.agoPct.toFixed(1)}%`}</span>
                <span className="text-right"><Change pts={r.changePts} /></span>
                <span className="min-w-0">
                  {(lines.get(r.sector) ?? []).some((p) => p.sharePct !== null) && (
                    <ShareSpark data={lines.get(r.sector)!} label={`${r.sector}: weekly share of all trading over the past year`} />
                  )}
                </span>
              </li>
            ))}
          </ul>
          <CardFooter className="block">
            Sectors with fewer than {MIN_SECTOR_STOCKS} stocks together: {trend.small.nowPct.toFixed(1)}% now, {trend.small.agoPct === null ? "—" : `${trend.small.agoPct.toFixed(1)}%`} a year ago, so the rows and this add to 100%.
            {" "}Uses today&apos;s Nifty Total Market list and today&apos;s sector labels: a stock NSE moved to another sector counts in its new one for both years. Stocks that left the list aren&apos;t counted, and new listings had no trading a year ago (rows where they are {NEW_LISTING_MARK * 100}% or more of recent trading are marked).
          </CardFooter>
        </>
      )}
    </Card>
  );
}
