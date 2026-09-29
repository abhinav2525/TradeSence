import Link from "next/link";
import SiteNav from "../../components/SiteNav";
import CrossingsTable from "../../components/CrossingsTable";
import { crossingStats } from "../../query/crossings";
import { MA_LABELS, type MaKind } from "../../query/breadth";

export const dynamic = "force-dynamic";

const TABS: MaKind[] = ["sma200", "ema200", "sma50"];

function isMaKind(v: string | undefined): v is MaKind {
  return v === "sma200" || v === "ema200" || v === "sma50";
}

export default async function CrossingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ma?: string }>;
}) {
  const { ma: raw } = await searchParams;
  const ma: MaKind = isMaKind(raw) ? raw : "sma200";
  const label = MA_LABELS[ma];
  const rows = await crossingStats(ma);

  const total = rows.reduce((n, r) => n + r.crossings, 0);
  const calmest = [...rows].reverse()[0];

  return (
    <main className="wrap">
      <SiteNav current="crossings" ma={ma} />
      <h1>How often each stock crosses its average</h1>
      <p className="sub">
        Not how strong a stock is — how <em>reliable</em> the signal is for it. A name that
        crosses constantly generates signals worth distrusting.
      </p>

      <nav className="tabs" aria-label="Moving average">
        {TABS.map((k) => (
          <Link key={k} href={`/crossings?ma=${k}`} className="tab"
                aria-current={k === ma ? "page" : undefined}>
            {MA_LABELS[k]}
          </Link>
        ))}
      </nav>

      {rows.length > 0 && (
        <div className="card">
          <div className="hero">
            <div>
              <div className="hero-num">{rows[0]!.crossings}</div>
              <div className="hero-label">
                crossings by {rows[0]!.symbol} — the busiest, vs {label}
              </div>
            </div>
            <div className="hero-split">
              <strong>{total}</strong> crossings across {rows.length} constituents
              <br />
              calmest: <strong>{calmest?.symbol}</strong> with {calmest?.crossings}
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <CrossingsTable rows={rows} maLabel={label} />
        <p className="note">
          A crossing is counted only between consecutive sessions that both have a value,
          so neither the start of the averaging window nor a gap in the data can fake one.
        </p>
      </div>
    </main>
  );
}
