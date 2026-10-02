import { Card } from "@/components/ui/card";
import Term from "@/components/Term";
import { formatDate, signed } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StockReport } from "@/query/stock-report";

const fall = (v: number) => (Math.abs(v) < 0.05 ? "0%" : `${signed(v, 1)}%`);

/** Each completed market crash: how far the stock fell vs the NIFTY 50, and whether it was back 6 months on. */
export default function CrashTable({ crashes, className }: { crashes: StockReport["crashes"]; className?: string }) {
  const rows = [...crashes.episodes].reverse(); // latest first
  return (
    <Card className={cn("flex flex-col", className)}>
      <div className="border-b px-5 py-3.5">
        <h2 className="text-heading text-foreground"><Term id="crash-episodes">In past market crashes</Term></h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Lowest point in the 3 months after each crash began</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-muted-foreground">No completed market crash in this stock's history yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] tabular-nums">
            <thead>
              <tr className="border-b text-left text-[12px] text-muted-foreground">
                <th className="px-5 py-2 font-medium">Crash began</th>
                <th className="px-3 py-2 text-right font-medium">This stock</th>
                <th className="px-3 py-2 text-right font-medium">NIFTY 50</th>
                <th className="px-5 py-2 text-right font-medium">Back in 6 months</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((e) => (
                <tr key={e.start}>
                  <td className="px-5 py-2 text-foreground">{formatDate(e.start)}</td>
                  <td className="px-3 py-2 text-right text-foreground">{fall(e.stockFall)}</td>
                  <td className="px-3 py-2 text-right text-foreground-2">{fall(e.niftyFall)}</td>
                  <td className="px-5 py-2 text-right text-foreground-2">{e.back === null ? "Not yet" : e.back ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-auto border-t px-5 py-3 text-[12px] text-muted-foreground">
        A crash: fewer than 20% of NIFTY 50 stocks above their 200-day average.
        {crashes.ongoing ? ` One began on ${formatDate(crashes.ongoing)} and counts once 3 months have passed.` : ""}
      </p>
    </Card>
  );
}
