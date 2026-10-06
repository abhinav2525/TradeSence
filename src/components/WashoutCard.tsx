import { Card, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Term from "@/components/Term";
import WashoutSpark, { type SparkPoint } from "@/components/WashoutSpark";
import { STATUS_LABEL, firedLine, washoutNote, washoutSentence } from "@/components/signals-copy";
import { WASHOUT_LINE, type Washout } from "@/indicators/signals";
import { cn } from "@/lib/utils";
import { NIFTY50 } from "@/ingest/indices";

const TONE = { active: "down", watching: "neutral", quiet: "outline" } as const;

/** The washout alarm: status, one sentence, recent breadth against the line. `tested`: the NIFTY 50's studied alarm. */
export default function WashoutCard({
  washout, recent, first, indexLabel = NIFTY50.label, tested = true, className,
}: { washout: Washout; recent: SparkPoint[]; first: string; indexLabel?: string; tested?: boolean; className?: string }) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <div className="grid gap-4 px-card-x pb-4 pt-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-heading text-foreground"><Term id="washout">Washed out</Term></h2>
            <Badge variant={TONE[washout.status]}>{STATUS_LABEL[washout.status]}</Badge>
          </div>
          <p className="text-body-sm leading-5 text-foreground-2">{washoutSentence(washout, indexLabel)}</p>
          <p className="text-[12px] leading-4 text-muted-foreground">
            {tested
              ? "Only the 200-day SMA: it is the only average our study of past washouts found a pattern for, from a handful of cases."
              : washoutNote(indexLabel, washout.total)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="mb-1 text-[12px] text-muted-foreground">Share above the 200-day SMA, last {recent.length} sessions</p>
          <WashoutSpark data={recent} line={WASHOUT_LINE} />
        </div>
      </div>
      <CardFooter className="mt-auto">{firedLine(washout, first)}</CardFooter>
    </Card>
  );
}
