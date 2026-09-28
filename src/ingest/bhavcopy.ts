/**
 * Parsers for NSE's daily "bhavcopy" (end-of-day price) files.
 *
 * NSE retired the old CSV layout in mid-2024 and replaced it with the wider
 * "UDiFF" one, so a ten-year backfill has to read both. Verified against the
 * live archive: UDiFF serves 2024-01-02 onwards, legacy serves up to
 * 2024-06-03. They overlap, so the cutover below sits safely inside that gap.
 */

export type BhavFormat = "udiff" | "legacy";

export type BhavRow = {
  tradeDate: string; // ISO yyyy-mm-dd
  symbol: string;
  series: string;
  open: number;
  high: number;
  low: number;
  close: number;
  prevClose: number;
  volume: number;
  turnover: number;
};

/** Cash-market series we care about: normal equity and trade-to-trade. */
const KEEP_SERIES = new Set(["EQ", "BE"]);

/** First date served by the UDiFF layout. Anything earlier uses the legacy one. */
export const UDIFF_START = "2024-01-01";

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

function splitLines(csv: string): string[] {
  return csv.split(/\r?\n/).filter((l) => l.trim() !== "");
}

function num(raw: string | undefined): number {
  const v = Number((raw ?? "").trim());
  return Number.isFinite(v) ? v : 0;
}

/**
 * NSE serves a full HTML error page with HTTP 404 on holidays, so a non-empty
 * body proves nothing. Every parser checks the header before trusting a byte.
 */
function requireHeader(header: string, required: string[], format: BhavFormat): string[] {
  const cols = header.split(",").map((c) => c.trim());
  const missing = required.filter((c) => !cols.includes(c));
  if (missing.length > 0) {
    throw new Error(
      `Unrecognised ${format} bhavcopy header (missing: ${missing.join(", ")}). ` +
        `Got: ${header.slice(0, 120)}`,
    );
  }
  return cols;
}

export function parseUdiff(csv: string): BhavRow[] {
  const lines = splitLines(csv);
  const cols = requireHeader(
    lines[0] ?? "",
    ["TradDt", "TckrSymb", "SctySrs", "ClsPric", "TtlTradgVol"],
    "udiff",
  );
  const at = (name: string) => cols.indexOf(name);
  const [iDate, iSym, iSrs, iOpen, iHigh, iLow, iClose, iPrev, iVol, iVal] = [
    at("TradDt"), at("TckrSymb"), at("SctySrs"), at("OpnPric"), at("HghPric"),
    at("LwPric"), at("ClsPric"), at("PrvsClsgPric"), at("TtlTradgVol"), at("TtlTrfVal"),
  ];

  const rows: BhavRow[] = [];
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    const series = (f[iSrs] ?? "").trim();
    if (!KEEP_SERIES.has(series)) continue;
    rows.push({
      tradeDate: (f[iDate] ?? "").trim(),
      symbol: (f[iSym] ?? "").trim(),
      series,
      open: num(f[iOpen]),
      high: num(f[iHigh]),
      low: num(f[iLow]),
      close: num(f[iClose]),
      prevClose: num(f[iPrev]),
      volume: num(f[iVol]),
      turnover: num(f[iVal]),
    });
  }
  return rows;
}

/** Converts NSE's legacy `02-JAN-2023` timestamp to `2023-01-02`. */
function legacyDateToIso(raw: string): string {
  const [d, mon, y] = raw.trim().split("-");
  const m = MONTHS.indexOf((mon ?? "").toUpperCase());
  if (m < 0) throw new Error(`Unparseable legacy date: ${raw}`);
  return `${y}-${String(m + 1).padStart(2, "0")}-${(d ?? "").padStart(2, "0")}`;
}

export function parseLegacy(csv: string): BhavRow[] {
  const lines = splitLines(csv);
  const cols = requireHeader(
    lines[0] ?? "",
    ["SYMBOL", "SERIES", "CLOSE", "TOTTRDQTY", "TIMESTAMP"],
    "legacy",
  );
  const at = (name: string) => cols.indexOf(name);
  const [iSym, iSrs, iOpen, iHigh, iLow, iClose, iPrev, iVol, iVal, iTs] = [
    at("SYMBOL"), at("SERIES"), at("OPEN"), at("HIGH"), at("LOW"), at("CLOSE"),
    at("PREVCLOSE"), at("TOTTRDQTY"), at("TOTTRDVAL"), at("TIMESTAMP"),
  ];

  const rows: BhavRow[] = [];
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    const series = (f[iSrs] ?? "").trim();
    if (!KEEP_SERIES.has(series)) continue;
    rows.push({
      tradeDate: legacyDateToIso(f[iTs] ?? ""),
      symbol: (f[iSym] ?? "").trim(),
      series,
      open: num(f[iOpen]),
      high: num(f[iHigh]),
      low: num(f[iLow]),
      close: num(f[iClose]),
      prevClose: num(f[iPrev]),
      volume: num(f[iVol]),
      turnover: num(f[iVal]),
    });
  }
  return rows;
}

export function bhavcopyUrl(dateIso: string): { url: string; format: BhavFormat } {
  const [y, m, d] = dateIso.split("-") as [string, string, string];
  if (dateIso >= UDIFF_START) {
    return {
      url: `https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_${y}${m}${d}_F_0000.csv.zip`,
      format: "udiff",
    };
  }
  const mon = MONTHS[Number(m) - 1]!;
  return {
    url: `https://nsearchives.nseindia.com/content/historical/EQUITIES/${y}/${mon}/cm${d}${mon}${y}bhav.csv.zip`,
    format: "legacy",
  };
}
