const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-29" -> "29 Sep 2026". Done by hand so server and browser agree. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

/** "2026-09-29" -> "Sep ’26", for axis ticks. */
export function formatMonth(iso: string): string {
  const [y, m] = iso.split("-");
  return `${MONTHS[Number(m) - 1]} ’${y!.slice(2)}`;
}

/** A signed number with a true minus sign and Indian grouping: +4, −12, −1,560, 0. */
export function signed(n: number, digits = 0): string {
  const rounded = Number(Math.abs(n).toFixed(digits));
  const s = rounded.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (rounded === 0) return s;
  return n > 0 ? `+${s}` : `−${s}`;
}

/** Indian digit grouping, matching how NSE figures are usually read. */
export function formatInt(n: number): string {
  return n.toLocaleString("en-IN");
}

/** A price to two decimals with Indian grouping: 127584.29 -> "1,27,584.29". */
export function formatPrice(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "2026-09-29" -> "29 Sep", for tables and short axis labels within a year. */
export function formatDayMonth(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
}

/** 1 → "1st", 92 → "92nd", 12 → "12th". */
export function ordinal(n: number): string {
  const v = Math.round(n);
  const teen = v % 100 >= 11 && v % 100 <= 13;
  const suffix = teen ? "th" : ["th", "st", "nd", "rd"][v % 10] ?? "th";
  return `${v}${v % 10 > 3 && !teen ? "th" : suffix}`;
}

/** Rupees, whole, Indian grouping, true minus: −₹1,820. */
export function formatRupees(n: number): string {
  const r = Math.round(n);
  const s = Math.abs(r).toLocaleString("en-IN");
  return r < 0 ? `−₹${s}` : `₹${s}`;
}

/** ₹ in crore: one decimal under ₹100 cr, none above. 2e7 → "₹2.0 cr". */
export function formatCrore(n: number): string {
  const cr = n / 1e7;
  return `₹${cr >= 100 ? Math.round(cr).toLocaleString("en-IN") : cr.toFixed(1)} cr`;
}

/** A share count the Indian way: "1.23 cr", "5.50 lakh", or "45,600". */
export function formatShares(n: number): string {
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)} lakh`;
  return Math.round(n).toLocaleString("en-IN");
}
