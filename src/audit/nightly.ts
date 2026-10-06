/**
 * Turns the Report Card audit's output (src/audit/report-card.ts) into nightly
 * WARNING lines. The audit runs as its own process: it shares no code with the
 * app on purpose (decision 0013), so the nightly job reads what it prints.
 */

/** Mismatch lines shown per night; the rest are counted, not listed. */
const MAX_LISTED = 10;

const SUMMARY = /^session (\S+) · .* · (\d+) mismatches$/;

/** The audit's summary line; it must end in "N mismatches" for SUMMARY (timings go on their own line). */
export function auditSummary(session: string, cards: { label: string; n: number }[], compared: number, mismatches: number): string {
  const total = cards.reduce((a, c) => a + c.n, 0);
  return `session ${session} · ${total} cards (${cards.map((c) => `${c.label} ${c.n}`).join(", ")}) · ${compared} numbers compared · ${mismatches} mismatches`;
}

/** No warnings for a clean audit; otherwise a summary, then one line per mismatch. */
export function auditWarnings(exitCode: number, stdout: string): string[] {
  const lines = stdout.split("\n").map((l) => l.trim());
  const summary = lines.map((l) => SUMMARY.exec(l)).find((m) => m !== null);
  // Without its summary line the audit didn't get to the end, whatever it exited with.
  if (!summary || (exitCode !== 0 && exitCode !== 1)) return [`Report Card audit did not finish (exit ${exitCode})`];
  if (exitCode === 0 && summary[2] === "0") return [];

  const mismatches = lines.filter((l) => l.startsWith("✗"));
  const out = [`Report Card audit: ${summary[2]} mismatches on session ${summary[1]} (bun run audit:report-card)`];
  out.push(...mismatches.slice(0, MAX_LISTED).map((l) => `Report Card audit ${l}`));
  if (mismatches.length > MAX_LISTED) out.push(`Report Card audit: and ${mismatches.length - MAX_LISTED} more`);
  return out;
}
