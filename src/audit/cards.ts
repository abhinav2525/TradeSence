/**
 * Which Report Cards the audit (src/audit/report-card.ts) checks on a session: one per
 * (registered index, member that day), each ranked among that index's members. The card
 * a stock's page serves without `u` (`isDefault`: the first registered index it is in
 * that day, decision 0035) is fetched the way the page fetches it, so the default rule is
 * audited too. Pure: names only, never any maths.
 */
import type { IndexEntry } from "../ingest/indices";

export type AuditCard = { sym: string; key: string; label: string; isDefault: boolean; peers: string[] };

/** `rows`: every (index_name, symbol) membership on the session. Registry order, then symbol. */
export function auditCards(rows: { index_name: string; symbol: string }[], indices: readonly IndexEntry[]): AuditCard[] {
  const membersOf = (ix: IndexEntry) => rows.filter((r) => r.index_name === ix.members).map((r) => r.symbol).sort();
  const firstIn = (sym: string) => indices.find((ix) => membersOf(ix).includes(sym))?.key;
  return indices.flatMap((ix, i) => {
    const peers = membersOf(ix);
    return peers.map((sym) => ({
      sym, key: ix.key, peers,
      label: i === 0 ? sym : `${sym} [${ix.label}]`, // the label in mismatch lines
      isDefault: firstIn(sym) === ix.key,
    }));
  });
}
