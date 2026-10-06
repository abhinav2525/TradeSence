import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import StockList from "@/components/StockList";
import { stockGroups } from "@/lib/report-card";
import { INDICES } from "@/ingest/indices";
import Hotkeys from "@/components/Hotkeys";
import { supportedStocks } from "@/query/stock-report";
import { resolveSession } from "@/query/breadth";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [stocks, latest] = await Promise.all([supportedStocks(), resolveSession("sma200")]);
  const groups = stockGroups(stocks);
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
