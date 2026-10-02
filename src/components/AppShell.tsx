import SiteNav from "@/components/SiteNav";

type Props = {
  current: "breadth" | "crossings";
  ma: string;
  asOf?: string | null;
  children: React.ReactNode;
};

/** Sidebar plus the content column. The document scrolls; the sidebar stays put. */
export default function AppShell({ current, ma, asOf, children }: Props) {
  return (
    <>
      <SiteNav current={current} ma={ma} asOf={asOf} />
      <main className="lg:pl-60">
        <div className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          {children}
        </div>
      </main>
    </>
  );
}
