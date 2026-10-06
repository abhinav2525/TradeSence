import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import StockList, { type StockGroup } from "@/components/StockList";
import { INDICES, NIFTY50 } from "@/ingest/indices";
import Hotkeys from "@/components/Hotkeys";
import { supportedStocks } from "@/query/stock-report";
import { resolveSession } from "@/query/breadth";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [stocks, latest] = await Promise.all([supportedStocks(), resolveSession("sma200")]);
  // NIFTY 50 members, then each other index's members not in the NIFTY 50, then former members
  const groups: StockGroup[] = [
    { title: "In the NIFTY 50", stocks: stocks.filter((s) => s.currentIn.includes(NIFTY50.key)) },
    ...INDICES.filter((ix) => ix.key !== NIFTY50.key).map((ix) => ({
      title: `In ${ix.label}, not the NIFTY 50`,
      stocks: stocks.filter((s) => s.currentIn.includes(ix.key) && !s.currentIn.includes(NIFTY50.key)),
    })),
    { title: "Former members since 2020", stocks: stocks.filter((s) => !s.current) },
  ];
  return (
    <AppShell current="stock" ma="sma200" asOf={latest}>
      <Hotkeys ma="sma200" page="stock" />
      <PageHeader
        eyebrow="Stocks"
        title="Report card"
        description={`Every stock that has been in the ${INDICES.map((ix) => ix.label).join(" or ")} since 2020. Pick one to see how risky it has been: trend, strength, bumpiness, worst fall, liquidity, and what a bad stretch would have cost.`}
      />
      <StockList groups={groups} />
    </AppShell>
  );
}
