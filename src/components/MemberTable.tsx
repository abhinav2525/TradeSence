import type { MemberRow } from "../query/breadth";

type Props = { title: string; rows: MemberRow[]; tone: "pos" | "neg"; maLabel: string };

/** Names within 2% of their average — the ones most likely to flip next. */
const NEAR = 2;

export default function MemberTable({ title, rows, tone, maLabel }: Props) {
  const color = tone === "pos" ? "var(--series-1)" : "var(--pole-neg)";
  return (
    <div className="card">
      <h2 className="h2">
        <span className="swatch" style={{ background: color }} aria-hidden="true" />
        {title}
      </h2>
      <p className="count">
        {rows.length} {rows.length === 1 ? "stock" : "stocks"} · vs {maLabel}
      </p>
      {rows.length === 0 ? (
        <p className="empty">None.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Symbol</th>
              <th scope="col" className="num">Close</th>
              <th scope="col" className="num">{maLabel}</th>
              <th scope="col" className="num">Distance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.symbol} className={Math.abs(r.pctFromMa) <= NEAR ? "near" : undefined}>
                <td className="sym">{r.symbol}</td>
                <td className="num">{r.close.toFixed(2)}</td>
                <td className="num">{r.ma.toFixed(2)}</td>
                <td className={`num ${tone}`}>
                  {r.pctFromMa >= 0 ? "+" : ""}
                  {r.pctFromMa.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="note">Shaded rows sit within {NEAR}% of the average.</p>
    </div>
  );
}
