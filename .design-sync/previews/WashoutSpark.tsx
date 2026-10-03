import { WashoutSpark } from "tradesence";

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

/** % of 50 members above their 200-day SMA, in steps of 2. */
const step2 = (v: number) => Math.max(0, Math.min(100, Math.round(v / 2) * 2));

// Slides from the mid-40s through the 20% line in the last fortnight.
const ACTIVE = sessions("2026-10-01", 60).map((date, i) => ({
  date,
  pct: step2(46 - i * 0.5 + 5 * Math.sin(i / 4) - (i > 45 ? (i - 45) * 0.9 : 0)),
}));

// Comfortable: drifting between 55% and 75%.
const QUIET = sessions("2026-10-01", 60).map((date, i) => ({
  date,
  pct: step2(64 + 8 * Math.sin(i / 8) + 3 * Math.sin(i / 2.5)),
}));

const Label = () => (
  <p className="mb-1 text-[12px] text-muted-foreground">Share above the 200-day SMA, last 60 sessions</p>
);

export const Active = () => (
  <div style={{ width: 420, padding: 16 }}>
    <Label />
    <WashoutSpark data={ACTIVE} line={20} />
  </div>
);

export const Quiet = () => (
  <div style={{ width: 420, padding: 16 }}>
    <Label />
    <WashoutSpark data={QUIET} line={20} />
  </div>
);
