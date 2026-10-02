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

/** A signed number with a true minus sign: +4, −12, 0. */
export function signed(n: number, digits = 0): string {
  const s = Math.abs(n).toFixed(digits);
  if (Number(s) === 0) return s;
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
