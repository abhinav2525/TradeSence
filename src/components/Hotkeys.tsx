"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toggleTheme } from "@/components/ThemeToggle";
import { hotkeyTarget, type HotkeyContext } from "@/components/hotkey-target";

/**
 * Keyboard navigation, because this is a readout you check repeatedly: arrows
 * step sessions, 1-3 switch the average, b/a/c/s/r switch page, t flips the theme.
 * Ignored while typing so the date field and the calculator still work normally.
 * Where each key goes lives in hotkey-target.ts (tested).
 */
export default function Hotkeys({ ma, prev, next, page, base, extra }: HotkeyContext) {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;

      if (e.key === "t") {
        e.preventDefault();
        toggleTheme();
        return;
      }
      const href = hotkeyTarget(e.key, { ma, prev, next, page, base, extra });
      if (href) {
        e.preventDefault();
        router.push(href);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ma, prev, next, page, base, extra, router]);

  return null;
}
