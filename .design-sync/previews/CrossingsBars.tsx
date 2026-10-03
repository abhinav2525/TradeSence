import { CrossingsBars, Card, CardHeader, CardTitle, CardDescription } from "tradesence";

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


const BUSIEST = [
  { symbol: "ITC", crossings: 61, avgRun: 28 },
  { symbol: "HINDUNILVR", crossings: 57, avgRun: 30 },
  { symbol: "NESTLEIND", crossings: 54, avgRun: 32 },
  { symbol: "BRITANNIA", crossings: 51, avgRun: 34 },
  { symbol: "KOTAKBANK", crossings: 49, avgRun: 35 },
  { symbol: "ASIANPAINT", crossings: 47, avgRun: 37 },
  { symbol: "HDFCBANK", crossings: 45, avgRun: 38 },
  { symbol: "CIPLA", crossings: 42, avgRun: 41 },
  { symbol: "INFY", crossings: 40, avgRun: 43 },
  { symbol: "SUNPHARMA", crossings: 37, avgRun: 46 },
  { symbol: "MARUTI", crossings: 35, avgRun: 49 },
  { symbol: "TCS", crossings: 33, avgRun: 52 },
];

export const TwelveBusiest = () => (
  <div style={{ width: 480, padding: 16 }}>
    <Card>
      <CardHeader>
        <div>
          <CardTitle>The twelve busiest</CardTitle>
          <CardDescription>Crossings of the 200-day SMA, since 2020</CardDescription>
        </div>
      </CardHeader>
      <div className="px-3 pb-4">
        <CrossingsBars data={BUSIEST} />
      </div>
    </Card>
  </div>
);

export const FastAverage = () => (
  <div style={{ width: 480, padding: 16 }}>
    <Card>
      <CardHeader>
        <div>
          <CardTitle>The five busiest</CardTitle>
          <CardDescription>Crossings of the 50-day SMA, since 2020</CardDescription>
        </div>
      </CardHeader>
      <div className="px-3 pb-4">
        <CrossingsBars
          data={[
            { symbol: "POWERGRID", crossings: 118, avgRun: 14 },
            { symbol: "NTPC", crossings: 112, avgRun: 15 },
            { symbol: "ITC", crossings: 109, avgRun: 15 },
            { symbol: "COALINDIA", crossings: 101, avgRun: 16 },
            { symbol: "ONGC", crossings: 97, avgRun: 17 },
          ]}
        />
      </div>
    </Card>
  </div>
);
