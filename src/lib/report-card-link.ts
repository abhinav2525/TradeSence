/**
 * A stock's Report Card link, or null when it has none. Pure and import-free so
 * client and server components can share it. With no `cards` list every symbol
 * links (NIFTY 50 views: every member has a card). Index views pass the symbols
 * that have a card, so a Nifty-Bank-only stock shows as plain text instead of
 * linking to a 404 until step B adds its card (decision 0034).
 */
export function reportCardHref(symbol: string, cards?: ReadonlySet<string>): string | null {
  return cards === undefined || cards.has(symbol) ? `/stock/${encodeURIComponent(symbol)}` : null;
}
