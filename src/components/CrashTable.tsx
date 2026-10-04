import { Card } from "@/components/ui/card";
import Term from "@/components/Term";
import { formatDate, formatDayMonth, signed } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StockReport } from "@/query/stock-report";

const fall = (v: number) => (Math.abs(v) < 0.05 ? "0%" : `${signed(v, 1)}%`);
/** "15 Jan → 3 Apr 2020", or with both years when the fall crossed New Year. */
const span = (from: string, to: string) =>
  from.slice(0, 4) === to.slice(0, 4) ? `${formatDayMonth(from)} → ${formatDate(to)}` : `${formatDate(from)} → ${formatDate(to)}`;

/** Each completed market crash: how far the stock fell vs the NIFTY 50, and whether it was back 6 months on. */
export default function CrashTable({ crashes, className }: { crashes: StockReport["crashes"]; className?: string }) {
  const rows = [...crashes.episodes].reverse(); // latest first
  return (
    <Card className={cn("flex flex-col", className)}>
      <div className="border-b px-card-x py-3.5">
        <h2 className="text-heading text-foreground"><Term id="crash-episodes">In past market crashes</Term></h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">How far it fell over each whole crash, not in one day: from its high in the 3 months before to its low in the 3 months after</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-card-x py-6 text-body-sm text-muted-foreground">No completed market crash in this stock's history yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm tabular-nums">
            <thead>
              <tr className="border-b text-left text-[12px] text-muted-foreground">
                <th className="px-card-x h-row-head font-medium">Crash began</th>
                <th className="px-3 h-row-head text-right font-medium">Its fall during the crash</th>
                <th className="px-3 h-row-head text-right font-medium">NIFTY 50&apos;s fall</th>
                <th className="px-card-x h-row-head text-right font-medium">Back in 6 months</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((e) => (
                <tr key={e.start}>
                  <td className="px-card-x py-cell text-foreground">{formatDate(e.start)}</td>
                  <td className="px-3 py-cell text-right text-foreground">
                    {fall(e.stockFall)}
                    {/* the span, so the % can't be read as one day's move */}
                    <span className="block text-[11px] text-muted-foreground">{span(e.peakDate, e.lowDate)}</span>
                  </td>
                  <td className="px-3 py-cell text-right text-foreground-2">{fall(e.niftyFall)}</td>
                  <td className="px-card-x py-cell text-right text-foreground-2">{e.back === null ? "Not yet" : e.back ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-auto border-t px-card-x py-3 text-[12px] text-muted-foreground">
        A crash: fewer than 20% of NIFTY 50 stocks above their 200-day average. Back in 6 months: above its price on the day the crash began.
        {crashes.ongoing ? ` One began on ${formatDate(crashes.ongoing)} and counts once 3 months have passed.` : ""}
      </p>
    </Card>
  );
}
