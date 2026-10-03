"use client";

import { useState } from "react";
import { Card, CardFooter } from "@/components/ui/card";
import { formatDate, formatRupees } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { HorizonKey } from "@/indicators/risk";
import type { HorizonPair } from "@/query/stock-report";
import { HORIZON_LABELS as LABEL, parseAmount } from "@/lib/report-card";
import Term from "@/components/Term";
import SlidingPill from "@/components/SlidingPill";

const ORDER: HorizonKey[] = ["1w", "1m", "3m", "1y"];

type Props = { symbol: string; horizons: Record<HorizonKey, HorizonPair>; initial: HorizonKey; firstDate: string };

/**
 * "If I put in ₹X, what does a bad stretch cost?" Every figure is a past range
 * from this stock's own history at the chosen horizon; the amount only scales
 * it, in the browser, so typing never reloads the page.
 */
export default function RiskCalculator({ symbol, horizons, initial, firstDate }: Props) {
  const [h, setH] = useState<HorizonKey>(initial);
  const [raw, setRaw] = useState("10000");
  // exactly what was typed; no amount → no figures, never a silently different amount
  const amount = parseAmount(raw);
  const { stock, nifty } = horizons[h];
  const l = LABEL[h];
  const rs = (pct: number) => formatRupees(((amount ?? 0) * pct) / 100);

  const pick = (k: HorizonKey) => {
    setH(k);
    // keep the choice in the URL (shareable) without a server round trip
    const url = new URL(window.location.href);
    url.searchParams.set("h", k);
    window.history.replaceState(null, "", url);
  };

  const max = stock ? Math.max(...stock.bins.map((b) => b.count), 1) : 1;
  const niftyBin = stock && nifty ? stock.bins.findIndex((b) => nifty.p10 >= b.from && nifty.p10 < b.to) : -1;

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-4 px-5 pb-2 pt-4">
        <div>
          <h2 className="text-heading text-foreground"><Term id="stretches">What could a bad stretch cost?</Term></h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Every overlapping {l.one} in {symbol}&apos;s history since {formatDate(firstDate)}{stock ? ` (${stock.windows.toLocaleString("en-IN")} of them)` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
            If I invest ₹
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1000}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              className="h-8 w-28 rounded-[8px] border border-input bg-transparent px-2 font-mono text-[12px] tabular-nums text-foreground"
            />
          </label>
          <div className="seg relative inline-flex items-center gap-0.5 rounded-md border bg-raised p-0.5" role="group" aria-label="Holding period">
            <SlidingPill active={h} />
            {ORDER.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={h === k}
                onClick={() => pick(k)}
                className={cn(
                  "h-7 rounded-[8px] px-2.5 text-[12px] font-medium transition-colors",
                  h === k ? "bg-thumb text-foreground shadow-thumb" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {LABEL[k].button}
              </button>
            ))}
          </div>
        </div>
      </div>

      {amount === null ? (
        <p className="px-5 pb-8 pt-4 text-body-sm text-muted-foreground">Type an amount in rupees to see what a bad stretch would have cost.</p>
      ) : !stock ? (
        <p className="px-5 pb-8 pt-4 text-body-sm text-muted-foreground">Not enough history yet for {l.one}-long stretches.</p>
      ) : (
        <div className="grid gap-6 px-5 pb-5 pt-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <dl className="flex flex-col gap-3 text-body-sm">
            <div>
              <dt className="text-foreground-2">
                {stock.p10 < 0 ? `1 in 10 ${l.many} lost more than` : `Even the weakest 1 in 10 ${l.many} ended higher, by at least`}
              </dt>
              <dd className={cn("text-metric tabular-nums", stock.p10 < 0 ? "text-down" : "text-up")}>{rs(stock.p10)}</dd>
            </div>
            <div>
              <dt className="text-foreground-2">The worst {l.one}, starting {formatDate(stock.worstStart)}</dt>
              <dd className="text-heading tabular-nums text-down">{rs(stock.worst)}</dd>
            </div>
            <div>
              <dt className="text-foreground-2">{l.many[0]!.toUpperCase() + l.many.slice(1)} that ended lower</dt>
              <dd className="text-heading tabular-nums text-foreground">{stock.shareNegative.toFixed(0)}%</dd>
            </div>
            {nifty && (
              <p className="text-[12px] leading-4 text-muted-foreground">
                For comparison, the NIFTY 50&apos;s 1-in-10 {l.one}: <span className="tabular-nums text-foreground-2">{rs(nifty.p10)}</span>.
              </p>
            )}
          </dl>

          <div className="flex min-w-0 flex-col">
            <div
              className="flex h-36 items-end gap-0.5"
              role="img"
              aria-label={`Outcomes of ${stock.windows} overlapping ${l.many} for ${formatRupees(amount)}: 1 in 10 lost more than ${rs(stock.p10)}.`}
            >
              {stock.bins.map((b, i) => (
                <div key={i} className="group relative flex h-full flex-1 items-end">
                  <div
                    className={cn(
                      "grow-y w-full rounded-t-[3px]",
                      b.to <= 0 ? "bg-down/70" : b.from >= 0 ? "bg-up/70" : "bg-chart-muted",
                      i === niftyBin && "ring-1 ring-inset ring-foreground/60",
                    )}
                    style={{ height: `${b.count ? Math.max(3, (b.count / max) * 100) : 0}%` }}
                  />
                  <span
                    className={cn(
                      "pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-[11px] tabular-nums text-popover-foreground shadow-pop group-hover:block",
                      i < 4 ? "left-0" : i > 15 ? "right-0" : "left-1/2 -translate-x-1/2",
                    )}
                  >
                    {rs(b.from)} to {rs(b.to)}: {b.count} {b.count === 1 ? l.one : l.many}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-muted-foreground">
              <span>{rs(stock.bins[0]!.from)}</span>
              <span>{rs(stock.bins.at(-1)!.to)}</span>
            </div>
            {niftyBin >= 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">Outlined: where the NIFTY 50&apos;s 1-in-10 {l.one} falls.</p>
            )}
          </div>
        </div>
      )}
      <CardFooter>Past ranges, not a forecast. Losses can be larger than anything in this history.</CardFooter>
    </Card>
  );
}
