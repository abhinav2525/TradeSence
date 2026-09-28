import Link from "next/link";
import BreadthChart from "../components/BreadthChart";
import MemberTable from "../components/MemberTable";
import { breadthSeries, latestBreakdown, MA_LABELS, type MaKind } from "../query/breadth";

export const dynamic = "force-dynamic";

const TABS: MaKind[] = ["sma200", "ema200", "sma50"];

function isMaKind(v: string | undefined): v is MaKind {
  return v === "sma200" || v === "ema200" || v === "sma50";
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ma?: string }>;
}) {
  const { ma: raw } = await searchParams;
  const ma: MaKind = isMaKind(raw) ? raw : "sma200";
  const label = MA_LABELS[ma];

  const [series, latest] = await Promise.all([breadthSeries(ma), latestBreakdown(ma)]);
  const today = series.at(-1);

  return (
    <main className="wrap">
      <h1>NIFTY 50 breadth</h1>
      <p className="sub">
        How many constituents are trading above their moving average. Source: NSE bhavcopy.
      </p>

      <nav className="tabs" aria-label="Moving average">
        {TABS.map((k) => (
          <Link
            key={k}
            href={`/?ma=${k}`}
            className="tab"
            aria-current={k === ma ? "page" : undefined}
          >
            {MA_LABELS[k]}
          </Link>
        ))}
      </nav>

      {!today ? (
        <div className="card">
          <p className="empty">
            No data yet. Run <code>bun run ingest:backfill &lt;start&gt; &lt;end&gt;</code> then{" "}
            <code>bun run indicators</code>.
          </p>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="hero">
              <div>
                <div className="hero-num">{today.pctAbove.toFixed(0)}%</div>
                <div className="hero-label">
                  above their {label} · {latest.date}
                </div>
              </div>
              <div className="hero-split">
                <strong>{today.above}</strong> above · <strong>{today.below}</strong> below
                <br />
                of {today.total} constituents with enough history
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="h2">Breadth over time</h2>
            <p className="count">
              Percentage above the {label}, {series[0]?.date} to {today.date}
            </p>
            <BreadthChart data={series} label={label} />
            <p className="note">
              Below 50% means most constituents sit under their long-term average.
            </p>
          </div>

          <div className="cols">
            <MemberTable title="Above" rows={latest.above} tone="pos" maLabel={label} />
            <MemberTable title="Below" rows={latest.below} tone="neg" maLabel={label} />
          </div>
        </>
      )}
    </main>
  );
}
