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
  return Number.isFinite(v) ? v : NaN;
}

/**
 * A close of zero is not a price. NSE occasionally ships blank or "-" fields,
 * and coercing those to 0 would depress that symbol's 200-day average for the
 * next 200 sessions with nothing to signal it. Such rows are dropped instead.
 */
function hasUsablePrices(close: number): boolean {
  return Number.isFinite(close) && close > 0;
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
    ["TradDt", "TckrSymb", "SctySrs", "OpnPric", "HghPric", "LwPric", "ClsPric",
     "PrvsClsgPric", "TtlTradgVol", "TtlTrfVal"],
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
    const close = num(f[iClose]);
    if (!hasUsablePrices(close)) continue;
    rows.push({
      tradeDate: requireIsoDate((f[iDate] ?? "").trim()),
      symbol: (f[iSym] ?? "").trim(),
      series,
      open: num(f[iOpen]),
      high: num(f[iHigh]),
      low: num(f[iLow]),
      close,
      prevClose: num(f[iPrev]),
      volume: num(f[iVol]),
      turnover: num(f[iVal]),
    });
  }
  return rows;
}

/** Guards against a half-parsed date reaching Postgres as e.g. year 20 AD. */
function requireIsoDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Not an ISO date: ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Converts NSE's legacy timestamp to ISO.
 *
 * Both `02-JAN-2023` and `13-JUL-20` occur in the archive — the two-digit form
 * showed up on 2020-07-13 and previously produced "20-07-13", i.e. year 20 AD,
 * which Postgres rejected mid-backfill. All data here is post-2000.
 */
function legacyDateToIso(raw: string): string {
  const [d, mon, y] = raw.trim().split("-");
  const m = MONTHS.indexOf((mon ?? "").toUpperCase());
  if (m < 0) throw new Error(`Unparseable legacy date: ${raw}`);

  const year = (y ?? "").length === 2 ? `20${y}` : y;
  return requireIsoDate(
    `${year}-${String(m + 1).padStart(2, "0")}-${(d ?? "").padStart(2, "0")}`,
  );
}

export function parseLegacy(csv: string): BhavRow[] {
  const lines = splitLines(csv);
  const cols = requireHeader(
    lines[0] ?? "",
    ["SYMBOL", "SERIES", "OPEN", "HIGH", "LOW", "CLOSE", "PREVCLOSE",
     "TOTTRDQTY", "TOTTRDVAL", "TIMESTAMP"],
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
    const close = num(f[iClose]);
    if (!hasUsablePrices(close)) continue;
    rows.push({
      tradeDate: legacyDateToIso(f[iTs] ?? ""),
      symbol: (f[iSym] ?? "").trim(),
      series,
      open: num(f[iOpen]),
      high: num(f[iHigh]),
      low: num(f[iLow]),
      close,
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

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

import { unzipSync } from "fflate";

export type FetchResult =
  | { status: "ok"; format: BhavFormat; rows: BhavRow[] }
  | { status: "holiday" }
  | { status: "error"; message: string };

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export type DownloadResult =
  | { kind: "ok"; bytes: Uint8Array }
  | { kind: "notfound" }
  | { kind: "failed"; message: string };

function udiffUrl(y: string, m: string, d: string): string {
  return `https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_${y}${m}${d}_F_0000.csv.zip`;
}

function legacyUrl(y: string, m: string, d: string): string {
  const mon = MONTHS[Number(m) - 1]!;
  return `https://nsearchives.nseindia.com/content/historical/EQUITIES/${y}/${mon}/cm${d}${mon}${y}bhav.csv.zip`;
}

/**
 * Downloads one file, separating three outcomes that must not be conflated:
 *
 *  - `ok`       HTTP 200.
 *  - `notfound` HTTP 404 — on this archive that means a market holiday. NSE
 *               still returns a ~3.4 KB body, so only the status is trustworthy.
 *  - `failed`   the request never produced an answer (timeout, DNS, refused
 *               connection) or the server 5xx'd.
 *
 * Collapsing `failed` into `notfound` would record a real trading day as a
 * holiday and never look at it again; letting it throw aborts an hours-long
 * backfill on one blip. So transient failures are retried with linear backoff
 * and, if they persist, reported — never guessed at.
 */
export async function download(
  url: string,
  opts: { retries?: number; timeoutMs?: number; backoffMs?: number } = {},
): Promise<DownloadResult> {
  const retries = opts.retries ?? 3;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const backoffMs = opts.backoffMs ?? 1_000;

  let lastMessage = "unknown error";

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.status === 200) {
        return { kind: "ok", bytes: new Uint8Array(await res.arrayBuffer()) };
      }
      // 404 is a definite answer: the file is not there. Do not retry it.
      if (res.status === 404) return { kind: "notfound" };

      // 5xx and friends are worth another go.
      lastMessage = `HTTP ${res.status}`;
    } catch (e) {
      lastMessage = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }

    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
    }
  }

  return { kind: "failed", message: lastMessage };
}

function unzipCsv(buf: Uint8Array): string {
  const files = unzipSync(buf);
  const name = Object.keys(files).find((n) => n.toLowerCase().endsWith(".csv"));
  if (!name) throw new Error(`Archive contained no CSV (entries: ${Object.keys(files).join(", ")})`);
  return new TextDecoder().decode(files[name]!);
}

/**
 * Downloads one trading day.
 *
 * Tries the format the date suggests, then the other — so a slightly wrong
 * cutover costs an extra request rather than silently reporting a trading day
 * as a holiday. Only when both are a definite 404 is it a holiday.
 *
 * Decoding is inside the same guard as the fetch: a truncated archive, an
 * unrecognised header, or an unparseable date must end the *day* as an error
 * that gets retried — never the whole backfill with a stack trace.
 *
 * `deps` exists so tests can feed a corrupt payload without a fake HTTP server.
 */
export async function fetchBhavcopy(
  dateIso: string,
  deps: { download?: typeof download } = {},
): Promise<FetchResult> {
  const get = deps.download ?? download;
  const [y, m, d] = dateIso.split("-") as [string, string, string];
  const primary = bhavcopyUrl(dateIso).format;
  const order: BhavFormat[] = primary === "udiff" ? ["udiff", "legacy"] : ["legacy", "udiff"];

  const failures: string[] = [];

  for (const format of order) {
    const url = format === "udiff" ? udiffUrl(y, m, d) : legacyUrl(y, m, d);
    const res = await get(url);

    if (res.kind === "ok") {
      try {
        const csv = unzipCsv(res.bytes);
        const rows = format === "udiff" ? parseUdiff(csv) : parseLegacy(csv);
        return { status: "ok", format, rows };
      } catch (e) {
        failures.push(`${format}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
    }
    if (res.kind === "failed") failures.push(`${format}: ${res.message}`);
  }

  if (failures.length > 0) return { status: "error", message: failures.join("; ") };
  return { status: "holiday" };
}
