import { AdLineChart, Card, CardFooter } from "tradesence";

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

/** Net advances per session (advancers − decliners of 50), clamped to −50..+50. */
function nets(dates: string[], drift: (i: number, n: number) => number) {
  return dates.map((date, i) => {
    const v = drift(i, dates.length) + 22 * Math.sin(i * 2.17 + 0.3) + 14 * Math.sin(i * 0.61);
    return { date, net: Math.max(-48, Math.min(48, Math.round(v))) };
  });
}

// A year that climbs into early summer, then rolls over into October.
const YEAR = nets(sessions("2026-10-01", 300), (i, n) => (i / n < 0.7 ? 4 : -9));

// One quarter of steady selling.
const QUARTER = nets(sessions("2026-10-01", 63), () => -6);

export const OneYear = () => (
  <div style={{ width: 760, padding: 16 }}>
    <Card>
      <AdLineChart data={YEAR} />
      <CardFooter>
        The level is arbitrary; the slope is the reading. A line that falls while the index holds
        near its high is a divergence worth watching.
      </CardFooter>
    </Card>
  </div>
);

export const SelectedSession = () => (
  <div style={{ width: 760, padding: 16 }}>
    <Card>
      <AdLineChart data={YEAR} selectedDate={YEAR[150]!.date} />
    </Card>
  </div>
);

export const FallingQuarter = () => (
  <div style={{ width: 760, padding: 16 }}>
    <Card>
      <AdLineChart data={QUARTER} />
    </Card>
  </div>
);
