import { ReturnBuckets } from "tradesence";

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


const BUCKETS = [
  { bucket: "<20", median: 10.8, n: 96 },
  { bucket: "20–40", median: 4.6, n: 241 },
  { bucket: "40–60", median: 3.2, n: 412 },
  { bucket: "60–80", median: 2.4, n: 583 },
  { bucket: "≥80", median: 1.6, n: 318 },
];

const Caption = ({ children }: { children: string }) => (
  <p className="mb-2 text-[12px] font-medium text-muted-foreground">{children}</p>
);

export const UnderTwentyHighlighted = () => (
  <div style={{ width: 520, padding: 16 }}>
    <Caption>Median 3-month return, by breadth on the day</Caption>
    <ReturnBuckets data={BUCKETS} all={3.1} highlight="<20" />
    <p className="mt-2 text-[12px] leading-4 text-muted-foreground">Dashed line: any day, +3.1%.</p>
  </div>
);

export const OverEightyHighlighted = () => (
  <div style={{ width: 520, padding: 16 }}>
    <Caption>Median 3-month return, by breadth on the day</Caption>
    <ReturnBuckets data={BUCKETS} all={3.1} highlight="≥80" />
    <p className="mt-2 text-[12px] leading-4 text-muted-foreground">Dashed line: any day, +3.1%.</p>
  </div>
);

export const WithALosingBucket = () => (
  <div style={{ width: 520, padding: 16 }}>
    <Caption>Median 3-month return, by breadth on the day</Caption>
    <ReturnBuckets
      data={[
        { bucket: "<20", median: 7.9, n: 41 },
        { bucket: "20–40", median: 2.8, n: 188 },
        { bucket: "40–60", median: 1.4, n: 377 },
        { bucket: "60–80", median: 0.6, n: 512 },
        { bucket: "≥80", median: -1.2, n: 204 },
      ]}
      all={1.0}
      highlight="≥80"
    />
  </div>
);
