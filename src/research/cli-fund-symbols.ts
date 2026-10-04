/**
 * Writes src/research/fund-symbols.txt: every NSE symbol that is a fund (ETF),
 * not a company, since 2016. Sources: the ISIN in one bhavcopy per month
 * (mutual-fund units start "INF"; catches ETFs since delisted) plus NSE's
 * current ETF list. Re-run occasionally; the file is committed so studies are
 * reproducible.  bun run research:fund-symbols
 */
import { writeFileSync } from "node:fs";
import { sql } from "../db";
import { bhavcopyUrl, download, unzipCsv } from "../ingest/bhavcopy";
import { FUND_SYMBOLS_FILE, fundSymbols } from "./funds";

const days = await sql<{ d: string }[]>`
  select min(trade_date)::text as d from ingest_log
  where source = 'bhavcopy' and status = 'ok' and trade_date >= '2016-09-28'
  group by date_trunc('month', trade_date) order by 1`;

const funds = new Set<string>();
let failed = 0;
for (const { d } of days) {
  const res = await download(bhavcopyUrl(d).url);
  if (res.kind !== "ok") { failed++; console.error(`[funds] ${d}: ${res.kind}`); continue; }
  for (const s of fundSymbols(unzipCsv(res.bytes))) funds.add(s);
}

const list = await download("https://nsearchives.nseindia.com/content/equities/eq_etfseclist.csv");
if (list.kind !== "ok") throw new Error("NSE's ETF list could not be downloaded");
const etfLines = new TextDecoder().decode(list.bytes).split(/\r?\n/).slice(1).filter((l) => l.trim() !== "");
for (const l of etfLines) funds.add(l.split(",")[0]!.trim());

if (failed > days.length / 10) throw new Error(`${failed} of ${days.length} monthly files failed; not writing a partial list`);
writeFileSync(FUND_SYMBOLS_FILE, [
  `# NSE funds (ETFs), not companies: ISIN starting INF in one bhavcopy per month since 2016-09,`,
  `# plus NSE's current ETF list (eq_etfseclist.csv). Written by bun run research:fund-symbols`,
  `# on ${new Date().toISOString().slice(0, 10)} from ${days.length - failed} monthly files. Used by research 0003 to leave funds out.`,
  ...[...funds].sort(),
  "",
].join("\n"));
console.log(`[funds] ${funds.size} fund symbols from ${days.length - failed} monthly files (+ NSE's current list), ${failed} failed`);
await sql.end();
