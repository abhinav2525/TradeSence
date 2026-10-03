"use client";

import { Rows3, Rows4 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Flips compact ↔ comfortable and remembers it; prepaint.ts reads it back before first paint. */
export function toggleDensity(): "compact" | "comfortable" {
  const root = document.documentElement;
  const next = root.getAttribute("data-density") === "comfortable" ? "compact" : "comfortable";
  root.setAttribute("data-density", next);
  try {
    localStorage.setItem("density", next);
  } catch {
    // storage blocked (private window): the switch still works for this visit
  }
  return next;
}

/*
 * No React state, like ThemeToggle: the `comfortable:` variant picks the icon
 * and label, so the server render and the first client render always agree.
 * Both name what a click switches *to*.
 */
export default function DensityToggle({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={toggleDensity}
      aria-label="Switch between compact and comfortable spacing"
      title="Switch spacing (d)"
      className={cn(
        "inline-flex items-center gap-2 rounded-md text-body-sm font-medium text-foreground-2 transition-colors hover:bg-raised hover:text-foreground",
        compact ? "size-9 justify-center" : "h-9 px-2.5",
        className,
      )}
    >
      <Rows3 className="size-4 comfortable:hidden" aria-hidden="true" />
      <Rows4 className="hidden size-4 comfortable:block" aria-hidden="true" />
      {!compact && (
        <>
          <span className="comfortable:hidden">Comfortable spacing</span>
          <span className="hidden comfortable:inline">Compact spacing</span>
          <kbd className="ml-auto rounded-sm border px-1.5 font-mono text-[10px] leading-4 text-muted-foreground">d</kbd>
        </>
      )}
    </button>
  );
}
