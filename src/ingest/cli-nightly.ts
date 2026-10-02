/**
 * Nightly job: ingest the latest sessions, then recompute indicators.
 *
 * Re-ingests a short trailing window rather than just today, so a missed night
 * (laptop asleep, NSE late) heals itself on the next run. Every step is
 * idempotent, so running it twice costs nothing.
 */
import { backfill } from "./backfill";
import { computeIndicators } from "../indicators/compute";
import { ingestCorporateActions } from "./corporate-actions";
import { ingestSymbolChanges } from "./symbol-changes";
import { sql } from "../db";

const LOOKBACK_DAYS = Number(process.env.NIGHTLY_LOOKBACK_DAYS ?? 7);

const end = new Date();
const start = new Date(end);
start.setUTCDate(start.getUTCDate() - LOOKBACK_DAYS);

const iso = (d: Date) => d.toISOString().slice(0, 10);

const tally = await backfill(iso(start), iso(end), { delayMs: 700 });
console.log(`[nightly] ingest:`, JSON.stringify(tally));

// Splits and bonuses, a month back (late filings) and a month ahead (announced
// ex-dates). A failure here is loud but not fatal: the window overlaps, so the
// next night picks up whatever this one missed.
const caFrom = new Date(end);
caFrom.setUTCDate(caFrom.getUTCDate() - 31);
const caTo = new Date(end);
caTo.setUTCDate(caTo.getUTCDate() + 30);
const actions = await ingestCorporateActions(iso(caFrom), iso(caTo));
console.log(`[nightly] corporate actions:`, JSON.stringify(actions));
if (actions.status === "error") {
  console.warn(`[nightly] WARNING corporate actions not updated: ${actions.message}`);
}

// Ticker renames: one small file, refreshed whole. On failure the stored list
// is still used, so only a rename from the last day or two could be missed.
const renames = await ingestSymbolChanges();
console.log(`[nightly] symbol changes:`, JSON.stringify(renames));
if (renames.status === "error") {
  console.warn(`[nightly] WARNING symbol changes not updated: ${renames.message}`);
}

const unparsed = await sql`
  select symbol, ex_date::text, subject from corporate_actions
  where kind = 'unparsed' and ex_date >= ${iso(caFrom)}`;
for (const u of unparsed) {
  console.warn(`[nightly] WARNING unreadable corporate action ${u.symbol} ${u.ex_date}: ${u.subject}`);
}

// A >30% overnight move with no action behind it means a split we do not know about.
const rows = await computeIndicators("NIFTY50", {
  onUnexplainedJump: (j) => {
    if (j.date >= iso(caFrom)) {
      console.warn(`[nightly] WARNING ${j.symbol} moved ${j.from} -> ${j.to} on ${j.date} with no corporate action`);
    }
  },
});
console.log(`[nightly] indicators: ${rows} rows`);

await sql.end();
