import { McClellanBars, Card } from "tradesence";

// Preview card only: draw the chart complete. The card capture freezes the clock
// mid draw-in; the app's motion code (useChartAnimation) skips animation under
// reduced motion. Designs built with the component still animate normally.
if (typeof window !== "undefined" && window.matchMedia) {
  const real = window.matchMedia.bind(window);
  window.matchMedia = (q: string) =>
    q.includes("prefers-reduced-motion")
      ? ({ matches: true, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false } as MediaQueryList)
      : real(q);
}


/** The last `n` weekday sessions ending on `to`, oldest first. */
function sessions(to: string, n: number): string[] {
  const out: string[] = [];
  const d = new Date(`${to}T00:00:00Z`);
  while (out.length < n) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.unshift(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** A ratio-adjusted McClellan: swings between roughly −150 and +150. */
const MIXED = sessions("2026-10-01", 120).map((date, i) => ({
  date,
  value: round1(70 * Math.sin(i / 9) + 38 * Math.sin(i / 3.7 + 0.8) + 14 * Math.sin(i * 1.9) - (i > 100 ? (i - 100) * 4 : 0)),
}));

/** A washed-out stretch: mostly below zero, one failed bounce. */
const WEAK = sessions("2026-10-01", 60).map((date, i) => ({
  date,
  value: round1(-55 - 45 * Math.sin(i / 7 + 0.5) + 22 * Math.sin(i / 2.3) - i * 0.6),
}));

export const LastHundredTwentySessions = () => (
  <div style={{ width: 720, padding: 16 }}>
    <Card>
      <McClellanBars data={MIXED} />
    </Card>
  </div>
);

export const BelowZeroStretch = () => (
  <div style={{ width: 720, padding: 16 }}>
    <Card>
      <McClellanBars data={WEAK} />
    </Card>
  </div>
);
