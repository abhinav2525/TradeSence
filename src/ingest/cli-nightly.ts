/**
 * Nightly job: ingest the latest sessions, then recompute indicators.
 *
 * Re-ingests a short trailing window rather than just today, so a missed night
 * (laptop asleep, NSE late) heals itself on the next run. Every step is
 * idempotent, so running it twice costs nothing.
 */
import { backfill } from "./backfill";
import { ingestIndexDays } from "./index-prices";
import { ingestDeliveryDays } from "./delivery";
import { auditWarnings } from "../audit/nightly";
import { computeUnusualDays } from "../indicators/compute-activity";
import { computeVolumeLeaders } from "../indicators/compute-volume-leaders";
import { computeMoneyFlow } from "../indicators/compute-money-flow";
import { refreshFundSymbols } from "../indicators/universe";
import { ingestIndexLists } from "./index-constituents";
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

// Delivery figures, same rule: only confirmed trading days (decision 0021).
const delivery = await ingestDeliveryDays(iso(start), iso(end), { delayMs: 300 });
console.log(`[nightly] delivery:`, JSON.stringify(delivery));
if (delivery.error > 0) console.warn(`[nightly] WARNING ${delivery.error} day(s) of delivery figures not loaded; retried tomorrow`);

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

// Today's NSE index members (Top volume page). Failed lists keep yesterday's members.
try {
  const lists = await ingestIndexLists();
  console.log(`[nightly] index lists: ${lists.ok} loaded`);
  if (lists.failed.length) console.warn(`[nightly] WARNING index lists not refreshed: ${lists.failed.join(", ")}`);
  for (const p of lists.sizeProblems) console.warn(`[nightly] WARNING size group: ${p}`);
} catch (e) {
  console.warn(`[nightly] WARNING index lists not refreshed: ${e instanceof Error ? e.message : e}`);
}

// New ETFs first, so a fund listed today can't show up as an unusual company.
const [lastDay] = await sql<{ d: string | null }[]>`
  select max(trade_date)::text d from ingest_log where source = 'bhavcopy' and status = 'ok'`;
if (lastDay?.d) {
  const funds = await refreshFundSymbols(lastDay.d);
  if (funds.status === "error") console.warn(`[nightly] WARNING fund list not refreshed: ${funds.message}`);
  else if (funds.added > 0) console.log(`[nightly] fund symbols: ${funds.added} new`);
}

// Unusual activity page: rebuilt in full after delivery and the averages (spec 2026-10-04).
try {
  const act = await computeUnusualDays();
  console.log(`[nightly] unusual activity: ${act.rows} stock-days from ${act.companies} companies`);
} catch (e) {
  console.warn(`[nightly] WARNING unusual activity not rebuilt: ${e instanceof Error ? e.message : e}`);
}

try {
  const vl = await computeVolumeLeaders();
  console.log(`[nightly] top volume: ${vl.rows} rows as of ${vl.asOf}`);
} catch (e) {
  console.warn(`[nightly] WARNING top volume not rebuilt: ${e instanceof Error ? e.message : e}`);
}

// Money flow page (spec 2026-10-05): same universe and sectors as Top volume.
try {
  const mf = await computeMoneyFlow();
  console.log(`[nightly] money flow: ${mf.rows} rows as of ${mf.asOf}`);
} catch (e) {
  console.warn(`[nightly] WARNING money flow not rebuilt: ${e instanceof Error ? e.message : e}`);
}

await sql.end();

// Independent recalculation of every Report Card number (decision 0013), now
// that tonight's averages exist. Its own process, by bun's absolute path:
// launchd's PATH has no bun.
const audit = Bun.spawnSync([process.execPath, "run", "src/audit/report-card.ts"], { stdout: "pipe", stderr: "pipe" });
const auditOut = audit.stdout.toString();
console.log(`[nightly] audit: ${auditOut.split("\n").find((l) => l.startsWith("session")) ?? "no summary"}`);
for (const w of auditWarnings(audit.exitCode ?? -1, auditOut)) console.warn(`[nightly] WARNING ${w}`);

// Last, so the copy includes tonight's data (decision 0021). A failed backup
// doesn't touch the data; yesterday's copy is still there.
const backup = Bun.spawnSync(["sh", "ops/backup.sh"], { stdout: "inherit", stderr: "inherit" });
if (backup.exitCode !== 0) console.warn(`[nightly] WARNING database backup failed (exit ${backup.exitCode})`);
