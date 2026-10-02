import Link from "next/link";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import Hotkeys from "@/components/Hotkeys";
import { Card } from "@/components/ui/card";
import { GLOSSARY, isTermId, termHref } from "@/lib/glossary";
import { liveExample } from "@/query/glossary-live";
import { resolveSession } from "@/query/breadth";

export const dynamic = "force-dynamic";

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={`p-5 ${className ?? ""}`}>
      <h2 className="text-heading text-foreground">{title}</h2>
      <div className="mt-2 text-[13px] leading-5 text-foreground-2">{children}</div>
    </Card>
  );
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // checked against the glossary before anything else: unknown ids never reach a query
  if (!isTermId(id)) notFound();
  const e = GLOSSARY[id];
  const [live, latest] = await Promise.all([liveExample(id), resolveSession("sma200")]);

  return (
    <AppShell current="learn" ma="sma200" asOf={latest}>
      <Hotkeys ma="sma200" page="learn" />
      <Link href="/learn" className="mb-3 inline-block text-[12px] font-medium text-brand hover:underline">
        ← All terms
      </Link>
      <PageHeader eyebrow={`Learn · ${e.topic}`} title={e.term} description={e.short} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="What it is" className="lg:col-span-2">{e.what}</Section>
        <Section title="How it's calculated">
          <p>{e.calc.plain}</p>
          {e.calc.exact && (
            <pre className="mt-3 overflow-x-auto rounded-md bg-raised px-3 py-2 font-mono text-[12px] text-foreground">{e.calc.exact}</pre>
          )}
        </Section>
        <Section title="How to read it">{e.read}</Section>
        <Section title="Worked example">{e.example}</Section>
        <Section title="Today in tradeSence">
          <p className="tabular-nums">{live ?? "Not available for today."}</p>
          {e.seeIt && (
            <Link href={e.seeIt.href} className="mt-2 inline-block font-medium text-brand hover:underline">
              See it: {e.seeIt.label} →
            </Link>
          )}
        </Section>
        <Section title="Common mistakes">
          <ul className="list-disc space-y-1.5 pl-4">
            {e.mistakes.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </Section>
        <Section title="Related terms">
          <ul className="flex flex-wrap gap-2">
            {e.related.map((r) => (
              <li key={r}>
                <Link href={termHref(r)} className="inline-block rounded-md border px-2.5 py-1 text-[12px] font-medium text-foreground transition-colors hover:bg-raised">
                  {GLOSSARY[r].term}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </div>
      <p className="mt-6 text-[12px] text-muted-foreground">
        Explanations are educational. Nothing in tradeSence is advice to buy or sell.
      </p>
    </AppShell>
  );
}
