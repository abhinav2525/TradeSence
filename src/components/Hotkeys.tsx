"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

type Props = {
  ma: string;
  prev?: string | null;
  next?: string | null;
  page: "breadth" | "crossings";
};

/**
 * Keyboard navigation, because this is a readout you check repeatedly: arrows
 * step sessions, 1-3 switch the average, b/c switch view. Ignored while typing
 * so the date field still works normally.
 */
export default function Hotkeys({ ma, prev, next, page }: Props) {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;

      const base = page === "breadth" ? "/" : "/crossings";
      const go = (href: string) => {
        e.preventDefault();
        router.push(href);
      };

      if (e.key === "ArrowLeft" && prev) return go(`/?ma=${ma}&date=${prev}`);
      if (e.key === "ArrowRight" && next) return go(`/?ma=${ma}&date=${next}`);
      if (e.key === "1") return go(`${base}?ma=sma200`);
      if (e.key === "2") return go(`${base}?ma=ema200`);
      if (e.key === "3") return go(`${base}?ma=sma50`);
      if (e.key === "b") return go(`/?ma=${ma}`);
      if (e.key === "c") return go(`/crossings?ma=${ma}`);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ma, prev, next, page, router]);

  return null;
}
