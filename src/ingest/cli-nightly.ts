/**
 * Nightly job: ingest the latest sessions, then recompute indicators.
 *
 * Re-ingests a short trailing window rather than just today, so a missed night
 * (laptop asleep, NSE late) heals itself on the next run. Every step is
 * idempotent, so running it twice costs nothing.
 */
import { backfill } from "./backfill";
import { ingestIndexDays } from "./index-prices";
import { computeIndicators } from "../indicators/compute";
import { ingestCorporateActions } from "./corporate-actions";
import { ingestSymbolChanges } from "./symbol-changes";
import { fetchNifty50Symbols } from "./nifty50";
import { membershipDrift, readMembershipHistory } from "./nifty50-history";
import { sql } from "../db";

const LOOKBACK_DAYS = Number(process.env.NIGHTLY_LOOKBACK_DAYS ?? 7);

const end = new Date();
const start = new Date(end);
start.setUTCDate(start.getUTCDate() - LOOKBACK_DAYS);

const iso = (d: Date) => d.toISOString().slice(0, 10);

const tally = await backfill(iso(start), iso(end), { delayMs: 700 });
console.log(`[nightly] ingest:`, JSON.stringify(tally));

// Index closes for the same days (only days the price step confirmed as trading).
const indices = await ingestIndexDays(iso(start), iso(end), { delayMs: 300 });
console.log(`[nightly] index closes:`, JSON.stringify(indices));
if (indices.error > 0) console.warn(`[nightly] WARNING ${indices.error} day(s) of index closes not loaded; retried tomorrow`);

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

// NSE changes the index twice a year. The membership file is maintained by
// hand, so say loudly when NSE's live list no longer matches it.
try {
  const drift = membershipDrift(readMembershipHistory(), await fetchNifty50Symbols(), iso(end));
  if (drift.added.length || drift.removed.length) {
    console.warn(
      `[nightly] WARNING NIFTY 50 changed: NSE added ${drift.added.join(", ") || "none"}, ` +
        `removed ${drift.removed.join(", ") || "none"}. Update src/ingest/nifty50-history.csv ` +
        `(see docs/decisions/0005) and run bun run ingest:nifty50.`,
    );
  }
} catch (e) {
  console.warn(`[nightly] WARNING could not check NIFTY 50 membership: ${e instanceof Error ? e.message : e}`);
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
