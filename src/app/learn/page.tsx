import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import LearnList from "@/components/LearnList";
import Hotkeys from "@/components/Hotkeys";
import { GLOSSARY, TOPICS } from "@/lib/glossary";
import { resolveSession } from "@/query/breadth";

export const dynamic = "force-dynamic";

export default async function Page() {
  const latest = await resolveSession("sma200");
  return (
    <AppShell current="learn" ma="sma200" asOf={latest}>
      <Hotkeys ma="sma200" page="learn" />
      <PageHeader
        eyebrow="tradeSence · Help"
        title="Learn"
        description="Every term in the app, in plain language: what it means, how it's calculated, and how to read it, with today's numbers."
      />
      <LearnList entries={Object.values(GLOSSARY).map(({ id, term, topic, short }) => ({ id, term, topic, short }))} topics={TOPICS} />
      <p className="mt-6 text-[12px] text-muted-foreground">
        Explanations are educational. Nothing in tradeSence is advice to buy or sell.
      </p>
    </AppShell>
  );
}
