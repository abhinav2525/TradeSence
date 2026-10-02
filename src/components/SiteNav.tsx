import Link from "next/link";
import { Activity, ArrowLeftRight, BookOpen, ChartColumn, ChartSpline, IdCard, ListFilter, type LucideIcon } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type Section = "breadth" | "advance-decline" | "crossings" | "screener" | "stock" | "learn";
type Props = { current: Section | null; ma: string; asOf?: string | null };

type NavLink = { key: Section; href: string; label: string; short: string; hint: string; icon: LucideIcon };

/**
 * Pages in labelled groups (docs/design/HANDOFF.md). Screener and Signals join
 * here when they are built, so the nav never links to a page that isn't there.
 */
const GROUPS: { label: string; links: NavLink[] }[] = [
  {
    label: "Market",
    links: [
      { key: "breadth", href: "/", label: "Breadth", short: "Breadth", hint: "b", icon: Activity },
      { key: "advance-decline", href: "/advance-decline", label: "Advance/Decline", short: "A/D", hint: "a", icon: ChartColumn },
    ],
  },
  {
    label: "Stocks",
    links: [
      { key: "crossings", href: "/crossings", label: "Crossings", short: "Crossings", hint: "c", icon: ArrowLeftRight },
      { key: "screener", href: "/screener", label: "Screener", short: "Screener", hint: "s", icon: ListFilter },
      { key: "stock", href: "/stock", label: "Report card", short: "Report card", hint: "r", icon: IdCard },
    ],
  },
  {
    label: "Help",
    links: [
      { key: "learn", href: "/learn", label: "Learn", short: "Learn", hint: "l", icon: BookOpen },
    ],
  },
];

const LINKS = GROUPS.flatMap((g) => g.links);

const SHORTCUTS = [
  ["← →", "Step a session"],
  ["1 2 3", "Switch average"],
  ["b a c s r l", "Switch page"],
] as const;

/** The product name in plain type. There is no logo yet; the glyph is lucide's chart-spline. */
function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2.5", className)} aria-label="tradeSence home">
      <span className="flex size-8 items-center justify-center rounded-md bg-brand-soft text-brand">
        <ChartSpline className="size-[18px]" aria-hidden="true" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-tight text-foreground">tradeSence</span>
        <span className="mt-1 text-[11px] text-muted-foreground">NIFTY 50 breadth</span>
      </span>
    </Link>
  );
}

/**
 * A fixed sidebar on large screens; a sticky top bar below lg, where a sidebar
 * would eat a third of a phone screen.
 */
export default function SiteNav({ current, ma, asOf }: Props) {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-card lg:flex">
        <Wordmark className="px-5 pb-6 pt-5" />

        {GROUPS.map((g, gi) => (
        <div key={g.label} className={cn(gi > 0 && "pt-5")}>
        <p className="px-5 pb-2 text-eyebrow uppercase text-muted-foreground">{g.label}</p>
        <nav aria-label={g.label} className="flex flex-col gap-0.5 px-3">
          {g.links.map((l) => {
            const active = current === l.key;
            const Icon = l.icon;
            return (
              <Link
                key={l.key}
                href={`${l.href}?ma=${ma}`}
                prefetch
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors",
                  active
                    ? "bg-brand-soft font-medium text-foreground"
                    : "text-foreground-2 hover:bg-raised hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "size-4",
                    active ? "text-brand" : "text-muted-foreground group-hover:text-foreground",
                  )}
                  aria-hidden="true"
                />
                {l.label}
                <kbd className="ml-auto rounded-sm border px-1.5 font-mono text-[10px] leading-4 text-muted-foreground">
                  {l.hint}
                </kbd>
              </Link>
            );
          })}
        </nav>
        </div>
        ))}

        <div className="mt-auto flex flex-col gap-4 p-3">
          <div className="rounded-md border bg-raised px-3 py-2.5">
            <p className="text-[11px] text-muted-foreground">Latest NSE close</p>
            <p className="mt-0.5 flex items-center gap-2 text-[13px] font-medium text-foreground">
              <span className="size-1.5 rounded-full bg-brand" aria-hidden="true" />
              {asOf ? formatDate(asOf) : "No data loaded"}
            </p>
          </div>

          <div className="px-2">
            <p className="pb-2 text-eyebrow uppercase text-muted-foreground">Shortcuts</p>
            <dl className="flex flex-col gap-1.5">
              {SHORTCUTS.map(([keys, what]) => (
                <div key={what} className="flex items-center justify-between text-[12px]">
                  <dt className="text-foreground-2">{what}</dt>
                  <dd className="font-mono text-[11px] text-muted-foreground">{keys}</dd>
                </div>
              ))}
            </dl>
          </div>

          <ThemeToggle className="w-full" />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-background/85 px-4 py-2.5 backdrop-blur-md lg:hidden">
        <Wordmark />
        {/* scrolls sideways rather than wrapping once there are more pages than room */}
        <nav aria-label="Sections" className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto">
          {LINKS.map((l) => {
            const active = current === l.key;
            return (
              <Link
                key={l.key}
                href={`${l.href}?ma=${ma}`}
                prefetch
                aria-current={active ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                  active ? "bg-brand-soft font-medium text-foreground" : "text-foreground-2 hover:text-foreground",
                )}
              >
                {l.short}
              </Link>
            );
          })}
        </nav>
        <ThemeToggle compact />
      </header>
    </>
  );
}
