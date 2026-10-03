import { PageHeader, MaTabs, Badge } from "tradesence";

export const WithActions = () => (
  <div style={{ width: 760, padding: 16 }}>
    <PageHeader
      eyebrow="NIFTY 50 · Market breadth"
      title="Breadth"
      description="How many of the fifty constituents close above their moving average, and how rare that is against every session since 2020."
      actions={<MaTabs base="/" ma="sma200" />}
    />
  </div>
);

export const TextOnly = () => (
  <div style={{ width: 640, padding: 16 }}>
    <PageHeader
      eyebrow="NIFTY 50 · Market"
      title="Advance/Decline"
      description="How many constituents rose against how many fell, every session. The line adds it up; the McClellan oscillator measures its momentum."
    />
  </div>
);

export const StockTitle = () => (
  <div style={{ width: 520, padding: 16 }}>
    <PageHeader
      eyebrow="NIFTY 50 · Stock"
      title="RELIANCE"
      actions={<Badge variant="up">Above its 200-day SMA</Badge>}
    />
  </div>
);

export const LearnEntry = () => (
  <div style={{ width: 520, padding: 16 }}>
    <PageHeader
      eyebrow="Learn · Breadth"
      title="Washout"
      description="A session when fewer than 20% of NIFTY 50 stocks close above their 200-day average: selling has reached nearly everything."
    />
  </div>
);
