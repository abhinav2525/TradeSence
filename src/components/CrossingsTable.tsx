import type { CrossingStat } from "../query/crossings";

type Props = { rows: CrossingStat[]; maLabel: string };

export default function CrossingsTable({ rows, maLabel }: Props) {
  if (rows.length === 0) return <p className="empty">No data yet.</p>;

  const busiest = rows[0]!.crossings || 1;

  return (
    <table>
      <thead>
        <tr>
          <th scope="col">Symbol</th>
          <th scope="col" className="num">Crossings</th>
          <th scope="col">Frequency</th>
          <th scope="col" className="num">Avg days per run</th>
          <th scope="col">Now</th>
          <th scope="col" className="num">Days in run</th>
          <th scope="col" className="num">Last crossing</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.symbol}>
            <td className="sym">{r.symbol}</td>
            <td className="num">{r.crossings}</td>
            <td>
              {/* width encodes the count; the number beside it carries the value */}
              <span className="bar" aria-hidden="true">
                <span style={{ width: `${Math.round((r.crossings / busiest) * 100)}%` }} />
              </span>
            </td>
            <td className="num">{r.avgDaysPerRun ? r.avgDaysPerRun.toFixed(0) : "—"}</td>
            <td className={r.currentState === "above" ? "pos" : "neg"}>
              {r.currentState === "above" ? "above" : "below"} {maLabel}
            </td>
            <td className="num">{r.daysInCurrentRun}</td>
            <td className="num">{r.lastCrossing ?? "never"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
