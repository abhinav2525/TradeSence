/**
 * The maths behind <CountUp>: read an on-screen figure ("−1,560", "₹476 cr",
 * "92nd"), and redraw any in-between value in exactly the same shape, so a
 * counting number never changes format and always ends on the true text.
 */
import { ordinal } from "./format";

export type Shown = { value: number; prefix: string; suffix: string; digits: number; signed: boolean; ordinal: boolean };

// optional ₹, optional true-minus/plus, digits with Indian or Western grouping, decimals, a known unit
const FIGURE = /^(₹?)([+−]?)(\d[\d,]*)(?:\.(\d+))?(%| cr|×|st|nd|rd|th)?$/;

export function parseShown(text: string): Shown | null {
  const m = FIGURE.exec(text);
  if (!m) return null;
  const [, prefix = "", sign = "", int = "", frac = "", suffix = ""] = m;
  const abs = Number(`${int.replace(/,/g, "")}${frac ? `.${frac}` : ""}`);
  if (!Number.isFinite(abs)) return null;
  return {
    value: sign === "−" ? -abs : abs,
    prefix, suffix, digits: frac.length, signed: sign !== "",
    ordinal: ["st", "nd", "rd", "th"].includes(suffix),
  };
}

export function formatLike(s: Shown, v: number): string {
  if (s.ordinal) return ordinal(Math.max(0, v));
  const rounded = Number(Math.abs(v).toFixed(s.digits));
  const body = rounded.toLocaleString("en-IN", { minimumFractionDigits: s.digits, maximumFractionDigits: s.digits });
  const sign = rounded === 0 ? "" : v < 0 ? "−" : s.signed ? "+" : "";
  return `${sign}${s.prefix}${body}${s.suffix}`;
}

/** Ease-out cubic from `from` to `to`; t is clamped to [0, 1] and t ≥ 1 returns `to` exactly. */
export function countFrame(from: number, to: number, t: number): number {
  if (t >= 1) return to;
  if (t <= 0) return from;
  const e = 1 - (1 - t) ** 3;
  return from + (to - from) * e;
}

/**
 * Whether and how to count. A figure appearing for the first time counts from 0,
 * unless it is already showing: on a slow phone the CSS failsafe reveals the true
 * figure before JavaScript arrives, and counting from 0 then would flicker
 * "16 → 0 → 16". A change always counts from what is on screen.
 */
export function countPlan(onScreen: number | null, alreadyShowing: boolean): { from: number; duration: "slow" | "base" } | null {
  if (onScreen !== null) return { from: onScreen, duration: "base" };
  return alreadyShowing ? null : { from: 0, duration: "slow" };
}
