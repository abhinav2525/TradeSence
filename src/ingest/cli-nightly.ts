/**
 * Nightly job: ingest the latest sessions, then recompute indicators.
 *
 * Re-ingests a short trailing window rather than just today, so a missed night
 * (laptop asleep, NSE late) heals itself on the next run. Every step is
 * idempotent, so running it twice costs nothing.
 */
import { backfill } from "./backfill";
import { computeIndicators } from "../indicators/compute";
import { sql } from "../db";

const LOOKBACK_DAYS = Number(process.env.NIGHTLY_LOOKBACK_DAYS ?? 7);

const end = new Date();
const start = new Date(end);
start.setUTCDate(start.getUTCDate() - LOOKBACK_DAYS);

const iso = (d: Date) => d.toISOString().slice(0, 10);

const tally = await backfill(iso(start), iso(end), { delayMs: 700 });
console.log(`[nightly] ingest:`, JSON.stringify(tally));

const rows = await computeIndicators();
console.log(`[nightly] indicators: ${rows} rows`);

await sql.end();
