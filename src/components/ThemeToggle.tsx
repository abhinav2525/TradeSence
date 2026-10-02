"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

/** Flips the theme and remembers it; the inline script in layout.tsx reads it back. */
export function toggleTheme() {
  const dark = document.documentElement.classList.toggle("dark");
  try {
    localStorage.setItem("theme", dark ? "dark" : "light");
  } catch {
    // storage blocked (private window): the switch still works for this visit
  }
}

/*
 * No React state: which icon and label show is decided by the `dark:` variant,
 * so the server render and the first client render always agree.
 */
export default function ThemeToggle({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Switch between dark and light theme"
      title="Switch theme (t)"
      className={cn(
        "inline-flex items-center gap-2 rounded-md text-[13px] font-medium text-foreground-2 transition-colors hover:bg-raised hover:text-foreground",
        compact ? "size-9 justify-center" : "h-9 px-2.5",
        className,
      )}
    >
      <Sun className="hidden size-4 dark:block" aria-hidden="true" />
      <Moon className="size-4 dark:hidden" aria-hidden="true" />
      {!compact && (
        <>
          <span className="hidden dark:inline">Light theme</span>
          <span className="dark:hidden">Dark theme</span>
          <kbd className="ml-auto rounded-sm border px-1.5 font-mono text-[10px] leading-4 text-muted-foreground">t</kbd>
        </>
      )}
    </button>
  );
}
