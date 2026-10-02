import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import StockList from "@/components/StockList";
import Hotkeys from "@/components/Hotkeys";
import { supportedStocks } from "@/query/stock-report";
import { resolveSession } from "@/query/breadth";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [stocks, latest] = await Promise.all([supportedStocks(), resolveSession("sma200")]);
  return (
    <AppShell current="stock" ma="sma200" asOf={latest}>
      <Hotkeys ma="sma200" page="stock" />
      <PageHeader
        eyebrow="NIFTY 50 · Stocks"
        title="Report card"
        description="Pick a stock to see how risky it has been: trend, strength, bumpiness, worst fall, liquidity, and what a bad stretch would have cost."
      />
      <StockList stocks={stocks} />
    </AppShell>
  );
}
