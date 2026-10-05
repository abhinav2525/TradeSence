import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Term from "@/components/Term";
import { KIND_LABEL } from "@/components/ActivityTable";
import { formatDate, signed } from "@/lib/format";
import { cn } from "@/lib/utils";
import { KINDS, isBigJump } from "@/indicators/activity";
import type { ActivityRow } from "@/query/activity";

const x = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}×`);

/** A NIFTY 50 stock's unusual days in the last 3 months. Facts only. */
export default function UnusualDaysCard({ rows, className }: { rows: ActivityRow[]; className?: string }) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="border-b px-card-x py-3.5">
        <h3 className="text-heading text-foreground"><Term id="unusual-activity">Unusual days</Term>, last 3 months</h3>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Against this stock&apos;s own last 20 sessions. What happened, not what comes next.</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-card-x py-6 text-body-sm text-muted-foreground">None in the last 3 months.</p>
      ) : (
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.tradeDate} className="flex flex-wrap items-center justify-between gap-2 px-card-x py-cell text-body-sm">
              <span className="font-medium text-foreground">{formatDate(r.tradeDate)}</span>
              <span className="flex flex-wrap gap-1">{KINDS.filter((k) => r[k]).map((k) => <Badge key={k} variant="neutral">{KIND_LABEL[k]}</Badge>)}{isBigJump(r.changePct) && <Badge variant="outline">Big price jump</Badge>}</span>
              <span className="tabular-nums text-foreground-2">
                kept {x(r.keptRatio)} · volume {x(r.volumeRatio)}
                {r.deliveryPct !== null && r.usualDeliveryPct !== null && ` · delivery ${r.deliveryPct.toFixed(0)}% (usual ${r.usualDeliveryPct.toFixed(0)}%)`}
              </span>
              <span className={cn("tabular-nums font-medium", r.changePct === null ? "text-muted-foreground" : r.changePct >= 0 ? "text-up" : "text-down")}>
                {r.changePct === null ? "—" : `price ${signed(r.changePct, 1)}% that day`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
