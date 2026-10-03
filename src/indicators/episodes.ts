/**
 * Episodes in a daily series: shared by research 0001, the Report Card's
 * "In crashes" light and the Signals page, so they can never count episodes
 * differently.
 */

/** Sessions: a dip that recovers for under two weeks is the same episode (research 0001). */
export const MERGE_GAP = 10;

/** One episode, as indices into the series: first and last qualifying day, and how many qualified. */
export type EpisodeSpan = { start: number; last: number; sessions: number };

/**
 * Episodes in a series: runs of days meeting `test`. A run that resumes
 * within `mergeGap` days of the last qualifying day is the same episode.
 *
 * This is what keeps the study honest: 51 weak days in March 2020 are one
 * event, and counting them as 51 independent signals would overstate the
 * evidence fifty-fold.
 */
export function findEpisodeSpans(pct: number[], test: (p: number) => boolean, mergeGap: number): EpisodeSpan[] {
  const spans: EpisodeSpan[] = [];
  let last = -Infinity;
  for (let i = 0; i < pct.length; i++) {
    if (!test(pct[i]!)) continue;
    if (i - last - 1 > mergeGap) spans.push({ start: i, last: i, sessions: 1 });
    else {
      const s = spans.at(-1)!;
      s.last = i;
      s.sessions++;
    }
    last = i;
  }
  return spans;
}

/** Start indices of episodes (research 0001, the Report Card's crash light). */
export function findEpisodes(pct: number[], test: (p: number) => boolean, mergeGap: number): number[] {
  return findEpisodeSpans(pct, test, mergeGap).map((s) => s.start);
}
