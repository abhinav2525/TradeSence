import { ingestDay, type IngestResult } from "./ingest-day";

/**
 * Every weekday in [startIso, endIso], inclusive.
 *
 * Weekends are skipped because NSE never publishes on them — that removes ~30%
 * of requests. Exchange holidays are not filtered: they are rarer, the calendar
 * shifts year to year, and the fetcher already records a 404 as a holiday.
 *
 * All arithmetic is in UTC so that a local DST transition cannot drop or
 * duplicate a day.
 */
export function weekdaysBetween(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);

  while (cur.getTime() <= end.getTime()) {
    const dow = cur.getUTCDay(); // 0 Sun .. 6 Sat
    if (dow !== 0 && dow !== 6) out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export type BackfillProgress = {
  date: string;
  result: IngestResult;
  done: number;
  total: number;
};

/**
 * Ingests a date range oldest-first, pausing between requests.
 *
 * Already-logged days short-circuit inside `ingestDay`, so an interrupted run
 * resumes simply by being started again.
 */
export async function backfill(
  startIso: string,
  endIso: string,
  opts: { delayMs?: number; onProgress?: (p: BackfillProgress) => void } = {},
): Promise<{ ok: number; holiday: number; skipped: number }> {
  const delayMs = opts.delayMs ?? 1000;
  const days = weekdaysBetween(startIso, endIso);
  const tally = { ok: 0, holiday: 0, skipped: 0 };

  for (let i = 0; i < days.length; i++) {
    const date = days[i]!;
    const result = await ingestDay(date);
    tally[result.status] += 1;
    opts.onProgress?.({ date, result, done: i + 1, total: days.length });

    // Only sleep when we actually hit the network.
    if (result.status !== "skipped" && i < days.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return tally;
}
