/**
 * The "Today:" line a tile's ⓘ shows. By default the tile's own value, but only a
 * tile that IS the term's current reading should use it: "Average since 2020" is
 * not today's breadth, so such tiles pass `today: null` (or their own sentence).
 */
export function tileToday(t: { value: string; unit?: string; today?: string | null }): string | undefined {
  if (t.today === null) return undefined;
  if (t.today !== undefined) return t.today;
  return `${t.value}${t.unit ? (/^[%×]/.test(t.unit) ? t.unit : ` ${t.unit}`) : ""}`;
}
