/**
 * Today's members of 43 NSE indices, from nsearchives.nseindia.com/content/indices
 * (Top volume page; spec 2026-10-04). Nifty Total Market is the universe and its
 * `Industry` column the sector; Nifty 100 / Midcap 150 / Smallcap 250 / Microcap
 * 250 are the size groups. Each index is replaced in its own transaction; a failed
 * or empty download keeps yesterday's members.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { download } from "./bhavcopy";

const BASE = "https://nsearchives.nseindia.com/content/indices/";
const REQUIRED = ["Company Name", "Industry", "Symbol", "Series", "ISIN Code"];

export const INDEX_LISTS = [
  { key: "total-market", name: "Nifty Total Market", file: "ind_niftytotalmarket_list.csv", group: "broad" },
  { key: "nifty-50", name: "NIFTY 50", file: "ind_nifty50list.csv", group: "broad" },
  { key: "next-50", name: "Nifty Next 50", file: "ind_niftynext50list.csv", group: "broad" },
  { key: "nifty-100", name: "Nifty 100", file: "ind_nifty100list.csv", group: "broad" },
  { key: "nifty-200", name: "Nifty 200", file: "ind_nifty200list.csv", group: "broad" },
  { key: "nifty-500", name: "Nifty 500", file: "ind_nifty500list.csv", group: "broad" },
  { key: "midcap-50", name: "Nifty Midcap 50", file: "ind_niftymidcap50list.csv", group: "broad" },
  { key: "midcap-100", name: "Nifty Midcap 100", file: "ind_niftymidcap100list.csv", group: "broad" },
  { key: "midcap-150", name: "Nifty Midcap 150", file: "ind_niftymidcap150list.csv", group: "broad" },
  { key: "smallcap-50", name: "Nifty Smallcap 50", file: "ind_niftysmallcap50list.csv", group: "broad" },
  { key: "smallcap-100", name: "Nifty Smallcap 100", file: "ind_niftysmallcap100list.csv", group: "broad" },
  { key: "smallcap-250", name: "Nifty Smallcap 250", file: "ind_niftysmallcap250list.csv", group: "broad" },
  { key: "microcap-250", name: "Nifty Microcap 250", file: "ind_niftymicrocap250_list.csv", group: "broad" },
  { key: "midsmallcap-400", name: "Nifty MidSmallcap 400", file: "ind_niftymidsmallcap400list.csv", group: "broad" },
  { key: "largemidcap-250", name: "Nifty LargeMidcap 250", file: "ind_niftylargemidcap250list.csv", group: "broad" },
  { key: "bank", name: "Nifty Bank", file: "ind_niftybanklist.csv", group: "sector" },
  { key: "private-bank", name: "Nifty Private Bank", file: "ind_nifty_privatebanklist.csv", group: "sector" },
  { key: "psu-bank", name: "Nifty PSU Bank", file: "ind_niftypsubanklist.csv", group: "sector" },
  { key: "financial-services", name: "Nifty Financial Services", file: "ind_niftyfinancelist.csv", group: "sector" },
  { key: "fin-ex-bank", name: "Nifty Financial Services Ex-Bank", file: "ind_niftyfinancialservicesexbank_list.csv", group: "sector" },
  { key: "fin-25-50", name: "Nifty Financial Services 25/50", file: "ind_niftyfinancialservices25_50list.csv", group: "sector" },
  { key: "it", name: "Nifty IT", file: "ind_niftyitlist.csv", group: "sector" },
  { key: "pharma", name: "Nifty Pharma", file: "ind_niftypharmalist.csv", group: "sector" },
  { key: "healthcare", name: "Nifty Healthcare", file: "ind_niftyhealthcarelist.csv", group: "sector" },
  { key: "auto", name: "Nifty Auto", file: "ind_niftyautolist.csv", group: "sector" },
  { key: "fmcg", name: "Nifty FMCG", file: "ind_niftyfmcglist.csv", group: "sector" },
  { key: "metal", name: "Nifty Metal", file: "ind_niftymetallist.csv", group: "sector" },
  { key: "realty", name: "Nifty Realty", file: "ind_niftyrealtylist.csv", group: "sector" },
  { key: "energy", name: "Nifty Energy", file: "ind_niftyenergylist.csv", group: "sector" },
  { key: "oil-gas", name: "Nifty Oil & Gas", file: "ind_niftyoilgaslist.csv", group: "sector" },
  { key: "media", name: "Nifty Media", file: "ind_niftymedialist.csv", group: "sector" },
  { key: "consumer-durables", name: "Nifty Consumer Durables", file: "ind_niftyconsumerdurableslist.csv", group: "sector" },
  { key: "cpse", name: "Nifty CPSE", file: "ind_niftycpselist.csv", group: "theme" },
  { key: "pse", name: "Nifty PSE", file: "ind_niftypselist.csv", group: "theme" },
  { key: "mnc", name: "Nifty MNC", file: "ind_niftymnclist.csv", group: "theme" },
  { key: "defence", name: "Nifty India Defence", file: "ind_niftyindiadefence_list.csv", group: "theme" },
  { key: "commodities", name: "Nifty Commodities", file: "ind_niftycommoditieslist.csv", group: "theme" },
  { key: "infrastructure", name: "Nifty Infrastructure", file: "ind_niftyinfralist.csv", group: "theme" },
  { key: "consumption", name: "Nifty India Consumption", file: "ind_niftyconsumptionlist.csv", group: "theme" },
  { key: "manufacturing", name: "Nifty India Manufacturing", file: "ind_niftyindiamanufacturing_list.csv", group: "theme" },
  { key: "digital", name: "Nifty India Digital", file: "ind_niftyindiadigital_list.csv", group: "theme" },
  { key: "tourism", name: "Nifty India Tourism", file: "ind_niftyindiatourism_list.csv", group: "theme" },
  { key: "mobility", name: "Nifty Mobility", file: "ind_niftymobility_list.csv", group: "theme" },
] as const;

export const UNIVERSE_KEY = "total-market";
export const SIZE_KEYS = { large: "nifty-100", mid: "midcap-150", small: "smallcap-250", micro: "microcap-250" } as const;

export type Constituent = { symbol: string; industry: string };

/** Splits one CSV line, honouring double quotes (company names can hold commas). */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export function parseConstituents(csv: string): Constituent[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  const cols = cells(lines[0] ?? "");
  const missing = REQUIRED.filter((c) => !cols.includes(c));
  if (missing.length) throw new Error(`Unrecognised index list header (missing: ${missing.join(", ")})`);
  const iSym = cols.indexOf("Symbol"), iInd = cols.indexOf("Industry");
  return lines.slice(1).map(cells).filter((f) => f[iSym]).map((f) => ({ symbol: f[iSym]!, industry: f[iInd] ?? "" }));
}

export async function fetchConstituents(file: string, deps: { download?: typeof download } = {}) {
  const res = await (deps.download ?? download)(BASE + file);
  if (res.kind !== "ok") return { status: "error" as const, message: res.kind === "failed" ? res.message : "HTTP 404" };
  try {
    const rows = parseConstituents(new TextDecoder().decode(res.bytes));
    if (rows.length === 0) return { status: "error" as const, message: "list had no rows" };
    return { status: "ok" as const, rows };
  } catch (e) {
    return { status: "error" as const, message: e instanceof Error ? e.message : String(e) };
  }
}

export function sizeProblems(universe: string[], sizes: Record<keyof typeof SIZE_KEYS, string[]>): string[] {
  const sets = Object.values(sizes).map((s) => new Set(s));
  return universe.flatMap((sym) => {
    const n = sets.filter((s) => s.has(sym)).length;
    return n === 1 ? [] : [n === 0 ? `${sym} is in no size list` : `${sym} is in ${n} size lists`];
  });
}

export async function ingestIndexLists(opts: { download?: typeof download; delayMs?: number } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const failed: string[] = [];
  let ok = 0;
  for (const [i, ix] of INDEX_LISTS.entries()) {
    const r = await fetchConstituents(ix.file, { download: opts.download });
    if (r.status === "error") failed.push(ix.name);
    else {
      const rows = [...new Map(r.rows.map((x) => [x.symbol, x])).values()]; // NSE can repeat a row
      await db.transaction(async (tx) => {
        await tx.delete(schema.indexConstituents).where(eq(schema.indexConstituents.indexKey, ix.key));
        await tx.insert(schema.indexConstituents).values(rows.map((x) => ({ indexKey: ix.key, symbol: x.symbol, industry: x.industry, fetchedOn: today })));
      });
      ok++;
    }
    if (i < INDEX_LISTS.length - 1) await new Promise((res) => setTimeout(res, opts.delayMs ?? 300));
  }
  const members = async (key: string) =>
    (await db.select({ s: schema.indexConstituents.symbol }).from(schema.indexConstituents).where(eq(schema.indexConstituents.indexKey, key))).map((r) => r.s);
  const problems = sizeProblems(await members(UNIVERSE_KEY), {
    large: await members(SIZE_KEYS.large), mid: await members(SIZE_KEYS.mid),
    small: await members(SIZE_KEYS.small), micro: await members(SIZE_KEYS.micro),
  });
  return { ok, failed, sizeProblems: problems };
}
