/**
 * Every sentence on the Signals page and in the home-page notice, built from
 * live numbers (decision 0017). Pure, so the wording is tested.
 */
import { formatDate, signed } from "../lib/format";
import { NOISE_PCT } from "../indicators/risk";
import {
  WASHOUT_LINE, type Condition, type Episode, type HorizonSummary, type Status, type Washout,
} from "../indicators/signals";

export const STATUS_LABEL: Record<Status, string> = { active: "Under 20% now", watching: "Close to 20%", quiet: "Well above 20%" };

/** "+14.1%", "−6.1%", "—". */
export function pctText(v: number | null): string {
  return v === null ? "—" : `${signed(v, 1)}%`;
}

/** Colour for a signed figure; one that rounds to 0.0 stays neutral. */
export function toneClass(v: number | null): string {
  if (v === null || Math.abs(v) < 0.05) return "text-foreground-2";
  return v > 0 ? "text-up" : "text-down";
}

const times = (n: number) => (n === 1 ? "once" : `${n} times`);

/** Shown wherever Signals runs on an index other than the NIFTY 50 (quant review; decision 0035). */
export const UNTESTED_LINE = "Same 20% line as the NIFTY 50 alarm; never tested on this index; several episodes are the same sell-off.";

/** The NIFTY 50 reads as a share; a smaller index as a count ("2 of Nifty Bank's 14 members"). */
export function washoutSentence(w: Washout, label = "NIFTY 50"): string {
  const lead = label === "NIFTY 50" || w.above === undefined || w.total === undefined
    ? `${Math.round(w.pct)}% of ${label} stocks are above their 200-day SMA`
    : `${w.above} of ${label}'s ${w.total} members are above their 200-day SMA (${Math.round(w.pct)}%)`;
  if (w.status === "active") return `${lead}, under the ${WASHOUT_LINE}% line. This washout began on ${formatDate(w.since)}.`;
  if (w.status === "watching") {
    const gap = Math.round(w.pct - WASHOUT_LINE);
    return gap === 0
      ? `${lead}, right on the ${WASHOUT_LINE}% line but not under it.`
      : `${lead}, ${gap} pts above the ${WASHOUT_LINE}% line.`;
  }
  return `${lead}, well clear of the ${WASHOUT_LINE}% line.`;
}

export function firedLine(w: Washout, first: string): string {
  if (w.fired === 0) return `No washout since ${formatDate(first)}`;
  const head = `${w.fired} ${w.fired === 1 ? "washout" : "washouts"} since ${first.slice(0, 4)}`;
  return w.status === "active"
    ? `${head} · this one began ${formatDate(w.since)}`
    : `${head} · last began ${formatDate(w.lastStart)}`;
}

/** The reading under the horizons table. Always names the sample size. */
export function readingSentence(cond: Condition, hs: HorizonSummary[], episodes: Episode[]): string {
  const one = hs.find((h) => h.key === "1m")!;
  const six = hs.find((h) => h.key === "6m")!;
  const name = cond === "under" ? "washout" : "over-80% episode";
  if (one.n === 0) return `No ${name} has had a month to play out yet.`;
  const sample = `Only ${one.n} ${name}${one.n === 1 ? "" : "s"} so far: a small sample.`;

  if (cond === "over") {
    const after = six.n === 0
      ? ""
      : `Six months after breadth went over 80%, the index was higher in ${six.higher} of ${six.n}, a median of ${pctText(six.median)} against ${pctText(six.baseline)} on an ordinary day. `;
    return `${after}The study behind this page found no edge here, so it is not an alarm. ${sample}`;
  }

  const comparable = hs.filter((h) => h.median !== null && h.baseline !== null);
  const beat = comparable.length > 0 && comparable.every((h) => h.median! > h.baseline!);
  let lead = "";
  if (six.n > 0) {
    lead = six.higher === six.n
      ? `All ${six.n} washouts with six months behind them had the index higher six months after they began`
      : `${six.higher} of ${six.n} washouts were higher six months on`;
    lead += beat ? ", and the median beat an ordinary day at every horizon. " : ". ";
  } else if (beat) {
    lead = "So far the median beat an ordinary day at every horizon. ";
  }
  const lows = episodes.filter((e) => e.returns["1m"] !== null && e.returns["1m"]! < -NOISE_PCT);
  const month = lows.length === 0
    ? "The first month was higher every time. "
    : `The first month was lower ${times(lows.length)} (${lows.map((e) => formatDate(e.start)).join(", ")}). `;
  return `${lead}${month}${sample}`;
}

/** The home page's notice, after the bold "Washout:". */
export function noticeText(six: HorizonSummary): string {
  const lead = `under ${WASHOUT_LINE}% of NIFTY 50 stocks are above their 200-day SMA.`;
  if (six.n === 0) return lead;
  return six.higher === six.n
    ? `${lead} After each of the ${six.n} earlier washouts, the index was higher 6 months later.`
    : `${lead} After ${six.higher} of the ${six.n} earlier washouts, the index was higher 6 months later.`;
}

/** Only while Active, and only when the reader is looking at the latest session. */
export function noticeVisible(status: Status | undefined, shown: string | null, latest: string | undefined): boolean {
  return status === "active" && shown !== null && shown === latest;
}
