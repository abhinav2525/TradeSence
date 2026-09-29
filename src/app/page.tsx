import Link from "next/link";
import SiteNav from "../components/SiteNav";
import DateNav from "../components/DateNav";
import BreadthChart from "../components/BreadthChart";
import MemberTable from "../components/MemberTable";
import {
  breadthSeries, breakdownOn, adjacentSessions, MA_LABELS, type MaKind,
} from "../query/breadth";

export const dynamic = "force-dynamic";

const TABS: MaKind[] = ["sma200", "ema200", "sma50"];

function isMaKind(v: string | undefined): v is MaKind {
  return v === "sma200" || v === "ema200" || v === "sma50";
}

/** Only accept a well-formed date; anything else falls back to the latest session. */
function cleanDate(v: string | undefined): string | undefined {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ma?: string; date?: string }>;
}) {
  const { ma: rawMa, date: rawDate } = await searchParams;
  const ma: MaKind = isMaKind(rawMa) ? rawMa : "sma200";
  const label = MA_LABELS[ma];
  const wanted = cleanDate(rawDate);

  const [series, view] = await Promise.all([breadthSeries(ma), breakdownOn(ma, wanted)]);
  const point = view.date ? series.find((p) => p.date === view.date) : series.at(-1);
  const nav = view.date
    ? await adjacentSessions(ma, view.date)
    : { prev: null, next: null };

  return (
    <main className="wrap">
      <SiteNav current="breadth" ma={ma} />
      <h1>NIFTY 50 breadth</h1>
      <p className="sub">
        How many constituents are trading above their moving average. Source: NSE bhavcopy.
      </p>

      <nav className="tabs" aria-label="Moving average">
        {TABS.map((k) => (
          <Link key={k} href={`/?ma=${k}${wanted ? `&date=${wanted}` : ""}`} className="tab"
                aria-current={k === ma ? "page" : undefined}>
            {MA_LABELS[k]}
          </Link>
        ))}
      </nav>

      <DateNav
        ma={ma}
        date={view.date}
        requested={view.requested}
        snapped={view.snapped}
        prev={nav.prev}
        next={nav.next}
        min={series[0]?.date ?? null}
        max={series.at(-1)?.date ?? null}
      />

      {!point ? (
        <div className="card">
          <p className="empty">
            No data for that date. Run <code>bun run ingest:backfill</code> then{" "}
            <code>bun run indicators</code>.
          </p>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="hero">
              <div>
                <div className="hero-num">{point.pctAbove.toFixed(0)}%</div>
                <div className="hero-label">
                  above their {label} · {view.date}
                </div>
              </div>
              <div className="hero-split">
                <strong>{point.above}</strong> above · <strong>{point.below}</strong> below
                <br />
                of {point.total} constituents with enough history
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="h2">Breadth over time</h2>
            <p className="count">
              Percentage above the {label}, {series[0]?.date} to {series.at(-1)?.date}
            </p>
            <BreadthChart data={series} label={label} selectedDate={view.date} />
            <p className="note">
              Below 50% means most constituents sit under their long-term average.
            </p>
          </div>

          <div className="cols">
            <MemberTable title="Above" rows={view.above} tone="pos" maLabel={label} />
            <MemberTable title="Below" rows={view.below} tone="neg" maLabel={label} />
          </div>
        </>
      )}
    </main>
  );
}
