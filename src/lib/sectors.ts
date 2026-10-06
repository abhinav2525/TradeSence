/**
 * The sector of every stock that has been in the NIFTY 50 since 2020, using
 * NSE's own industry names (the "Industry" column of ind_nifty50list.csv).
 * Keyed by today's symbol, like nifty50-history.csv, so a renamed member
 * needs no lookup through symbol_changes.
 *
 * Kept by hand: a member added at a rebalance needs a row here in the same
 * change as its row in nifty50-history.csv. tests/sectors.test.ts fails if a
 * member is missing, and checks today's members against NSE's live list.
 * Decision: docs/decisions/0039-sector-tags.md.
 */

export const SECTORS = {
  ADANIENT: "Metals & Mining",
  ADANIPORTS: "Services",
  APOLLOHOSP: "Healthcare",
  ASIANPAINT: "Consumer Durables",
  AXISBANK: "Financial Services",
  "BAJAJ-AUTO": "Automobile and Auto Components",
  BAJAJFINSV: "Financial Services",
  BAJFINANCE: "Financial Services",
  BEL: "Capital Goods",
  BHARTIARTL: "Telecommunication",
  BPCL: "Oil Gas & Consumable Fuels",
  BRITANNIA: "Fast Moving Consumer Goods",
  BSE: "Financial Services",
  CIPLA: "Healthcare",
  COALINDIA: "Oil Gas & Consumable Fuels",
  DIVISLAB: "Healthcare",
  DRREDDY: "Healthcare",
  EICHERMOT: "Automobile and Auto Components",
  ETERNAL: "Consumer Services",
  GAIL: "Oil Gas & Consumable Fuels",
  GRASIM: "Construction Materials",
  HCLTECH: "Information Technology",
  HDFC: "Financial Services",
  HDFCBANK: "Financial Services",
  HDFCLIFE: "Financial Services",
  HEROMOTOCO: "Automobile and Auto Components",
  HINDALCO: "Metals & Mining",
  HINDUNILVR: "Fast Moving Consumer Goods",
  ICICIBANK: "Financial Services",
  INDIGO: "Services",
  INDUSINDBK: "Financial Services",
  INDUSTOWER: "Telecommunication",
  INFY: "Information Technology",
  IOC: "Oil Gas & Consumable Fuels",
  ITC: "Fast Moving Consumer Goods",
  JIOFIN: "Financial Services",
  JSWSTEEL: "Metals & Mining",
  KOTAKBANK: "Financial Services",
  LT: "Construction",
  LTM: "Information Technology",
  "M&M": "Automobile and Auto Components",
  MARUTI: "Automobile and Auto Components",
  MAXHEALTH: "Healthcare",
  NESTLEIND: "Fast Moving Consumer Goods",
  NTPC: "Power",
  ONGC: "Oil Gas & Consumable Fuels",
  POWERGRID: "Power",
  RELIANCE: "Oil Gas & Consumable Fuels",
  SBILIFE: "Financial Services",
  SBIN: "Financial Services",
  SHREECEM: "Construction Materials",
  SHRIRAMFIN: "Financial Services",
  SUNPHARMA: "Healthcare",
  TATACONSUM: "Fast Moving Consumer Goods",
  TATASTEEL: "Metals & Mining",
  TCS: "Information Technology",
  TECHM: "Information Technology",
  TITAN: "Consumer Durables",
  TMPV: "Automobile and Auto Components",
  TRENT: "Consumer Services",
  ULTRACEMCO: "Construction Materials",
  UPL: "Chemicals",
  VEDL: "Metals & Mining",
  WIPRO: "Information Technology",
  YESBANK: "Financial Services",
  ZEEL: "Media Entertainment & Publication",
} as const satisfies Record<string, string>;

export type Sector = (typeof SECTORS)[keyof typeof SECTORS];

/** Short names for narrow table columns; the full NSE name goes in the tooltip. */
const SHORT: Partial<Record<Sector, string>> = {
  "Automobile and Auto Components": "Auto",
  "Fast Moving Consumer Goods": "FMCG",
  "Information Technology": "IT",
  "Oil Gas & Consumable Fuels": "Oil & Gas",
  "Media Entertainment & Publication": "Media",
};

/** NSE's sector name for a symbol, or null for a stock we have no tag for. */
export function sectorOf(symbol: string): Sector | null {
  return Object.hasOwn(SECTORS, symbol) ? SECTORS[symbol as keyof typeof SECTORS] : null;
}

export function shortSector(sector: Sector): string {
  return SHORT[sector] ?? sector;
}
