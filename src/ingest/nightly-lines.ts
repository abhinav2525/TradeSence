/**
 * Log lines for the nightly job (decision 0033). Pure, so the wording is tested:
 * the 5 Oct 2026 19:30 run logged `"error":3` with no reason, and finding out why
 * (NSE was still publishing) took a manual check.
 */
import type { BackfillProgress } from "./backfill";

/** One WARNING per day that ended in `error`, with the reason; null for every other outcome. */
export function ingestWarning(p: BackfillProgress): string | null {
  if (p.result.status !== "error") return null;
  return `[nightly] WARNING ${p.date} not loaded: ${p.result.message} (retried at the 20:15 run and tomorrow)`;
}
