import { BreadthArea, Card, CardFooter } from "tradesence";

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


/** NSE-style weekday sessions from `from` through `to`, as ISO dates. */
function sessions(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Share of 50 members above their 200-day SMA: slow cycles, a 2020 crash, a late-2026 slide. */
function breadth(dates: string[]) {
  const n = dates.length;
  return dates.map((date, i) => {
    const t = i / n;
    let v =
      62 +
      18 * Math.sin(i / 70) +
      9 * Math.sin(i / 23 + 1.3) +
      4 * Math.sin(i / 6.1 + 0.4);
    if (i > 40 && i < 120) v -= 55 * Math.sin(((i - 40) / 80) * Math.PI); // Mar 2020 crash
    if (t > 0.94) v -= (t - 0.94) * 700; // the slide into Oct 2026
    const above = Math.max(1, Math.min(49, Math.round(v / 2)));
    return { date, pct: above * 2, above, total: 50 };
  });
}

const ALL = breadth(sessions("2020-01-01", "2026-10-01"));

export const SinceTwentyTwenty = () => (
  <div style={{ width: 760, padding: 16 }}>
    <Card>
      <BreadthArea data={ALL} />
      <CardFooter>
        Under the halfway line, most of the index sits below its own long-term average. The shaded
        bands mark the extremes: under 20% and over 80%.
      </CardFooter>
    </Card>
  </div>
);

export const SelectedSession = () => (
  <div style={{ width: 760, padding: 16 }}>
    <Card>
      <BreadthArea data={ALL} selectedDate={ALL[ALL.length - 1]!.date} />
      <CardFooter>Marker on 1 Oct 2026: 13 of 50 constituents above the 200-day SMA.</CardFooter>
    </Card>
  </div>
);

const RECENT = ALL.slice(-250);

export const LastYearWithMarker = () => (
  <div style={{ width: 760, padding: 16 }}>
    <Card>
      <BreadthArea data={RECENT} selectedDate={RECENT[180]!.date} />
    </Card>
  </div>
);
