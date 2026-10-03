import { MemberTable } from "tradesence";

const above = [
  { symbol: "BHARTIARTL", close: 1942.6, ma: 1712.35, pctFromMa: 13.45 },
  { symbol: "SUNPHARMA", close: 1868.1, ma: 1702.8, pctFromMa: 9.71 },
  { symbol: "TITAN", close: 3652.4, ma: 3418.9, pctFromMa: 6.83 },
  { symbol: "HDFCBANK", close: 1729.55, ma: 1664.2, pctFromMa: 3.93 },
  { symbol: "ICICIBANK", close: 1301.0, ma: 1279.45, pctFromMa: 1.68 },
  { symbol: "ITC", close: 486.3, ma: 482.1, pctFromMa: 0.87 },
];

const below = [
  { symbol: "INFY", close: 1488.25, ma: 1514.6, pctFromMa: -1.74 },
  { symbol: "RELIANCE", close: 2794.6, ma: 2921.4, pctFromMa: -4.34 },
  { symbol: "TATASTEEL", close: 138.42, ma: 149.85, pctFromMa: -7.63 },
  { symbol: "MARUTI", close: 11420.0, ma: 12588.3, pctFromMa: -9.28 },
  { symbol: "ADANIENT", close: 2381.15, ma: 2846.7, pctFromMa: -16.35 },
];

export const AboveTheLine = () => (
  <div style={{ width: 520, padding: 16 }}>
    <MemberTable title="Above the" rows={above} tone="up" maLabel="200-day SMA" />
  </div>
);

export const BelowTheLine = () => (
  <div style={{ width: 520, padding: 16 }}>
    <MemberTable title="Below the" rows={below} tone="down" maLabel="200-day SMA" />
  </div>
);

export const SingleStock = () => (
  <div style={{ width: 520, padding: 16 }}>
    <MemberTable title="Above the" rows={[{ symbol: "NESTLEIND", close: 2512.3, ma: 2474.9, pctFromMa: 1.51 }]} tone="up" maLabel="50-day SMA" />
  </div>
);

export const Empty = () => (
  <div style={{ width: 520, padding: 16 }}>
    <MemberTable title="Above the" rows={[]} tone="up" maLabel="200-day EMA" />
  </div>
);
