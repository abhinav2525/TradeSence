import { Readout } from "tradesence";

export const BreadthTiles = () => (
  <div style={{ width: 560, padding: 16 }}>
    <Readout
      tiles={[
        {
          label: "Percentile",
          term: "percentile",
          value: "3.0",
          badge: { text: "Rare low", tone: "down" },
          fill: 0.03,
          fillTone: "down",
          sub: "Weaker than 97% of sessions since 2020",
        },
        {
          label: "Five-session change",
          term: "five-session-change",
          value: "−16",
          unit: "pts",
          direction: "down",
          sub: "Deteriorating since 24 Sep 2026",
        },
        { label: "Average since 2020", term: "breadth", today: null, value: "65", unit: "%", fill: 0.65, sub: "Today is −49 pts from it" },
        {
          label: "One-year range",
          term: "breadth",
          today: null,
          value: "16–86",
          unit: "%",
          range: { lo: 16, hi: 86, now: 16 },
          sub: "Low and high of the last 250 sessions",
        },
      ]}
    />
  </div>
);

export const AdvanceDeclineTiles = () => (
  <div style={{ width: 560, padding: 16 }}>
    <Readout
      tiles={[
        { label: "McClellan", term: "mcclellan", value: "−58.8", badge: { text: "Below zero", tone: "down" }, sub: "Negative for 4 sessions" },
        { label: "Summation index", term: "summation-index", value: "−1,560", badge: { text: "Falling", tone: "down" }, sub: "−705 twenty sessions ago" },
        { label: "10-day advancing share", term: "advancing-share-10d", value: "35.7", unit: "%", fill: 0.357, sub: "A thrust needs under 40%, then over 61.5% within 10 sessions" },
        { label: "Advancing sessions", term: "advancers-decliners", today: null, value: "6", unit: "of 20", sub: "More risers than fallers, last 20 sessions" },
      ]}
    />
  </div>
);

export const RisingTile = () => (
  <div style={{ width: 280, padding: 16 }}>
    <Readout
      className="grid-cols-1"
      tiles={[{ label: "Five-session change", value: "+12", unit: "pts", direction: "up", badge: { text: "Improving", tone: "up" }, sub: "Improving since 24 Sep 2026" }]}
    />
  </div>
);
