import Link from "next/link";
import { cn } from "@/lib/utils";

type Props = { current: "breadth" | "crossings"; ma: string; asOf?: string | null };

const LINKS = [
  { key: "breadth", href: "/", label: "Breadth", hint: "b" },
  { key: "crossings", href: "/crossings", label: "Crossings", hint: "c" },
] as const;

export default function SiteNav({ current, ma, asOf }: Props) {
  return (
    <header className="mb-7 flex flex-wrap items-baseline justify-between gap-y-2 border-b pb-3">
      <nav className="flex gap-5" aria-label="Sections">
        {LINKS.map((l) => (
          <Link
            key={l.key}
            href={`${l.href}?ma=${ma}`}
            prefetch
            aria-current={current === l.key ? "page" : undefined}
            className={cn(
              "group flex items-baseline gap-1.5 text-sm transition-colors",
              current === l.key
                ? "font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {l.label}
            <kbd className="rounded border px-1 font-mono text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
              {l.hint}
            </kbd>
          </Link>
        ))}
      </nav>
      {asOf && (
        <p className="font-mono text-xs text-muted-foreground">
          NSE close {asOf}
        </p>
      )}
    </header>
  );
}
