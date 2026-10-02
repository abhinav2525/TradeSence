/**
 * Episodes in a daily series: shared by research 0001 and the Report Card's
 * "In crashes" light, so the two can never count crashes differently.
 */

/** Sessions: a dip that recovers for under two weeks is the same episode (research 0001). */
export const MERGE_GAP = 10;

/**
 * Start indices of episodes: runs of days meeting `test`. A run that resumes
 * within `mergeGap` days of the last qualifying day is the same episode.
 *
 * This is what keeps the study honest: 51 weak days in March 2020 are one
 * event, and counting them as 51 independent signals would overstate the
 * evidence fifty-fold.
 */
export function findEpisodes(pct: number[], test: (p: number) => boolean, mergeGap: number): number[] {
  const starts: number[] = [];
  let last = -Infinity;
  for (let i = 0; i < pct.length; i++) {
    if (!test(pct[i]!)) continue;
    if (i - last - 1 > mergeGap) starts.push(i);
    last = i;
  }
  return starts;
}
