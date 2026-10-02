import type { Section } from "@/components/SiteNav";

const BASE: Record<Section, string> = {
  breadth: "/",
  "advance-decline": "/advance-decline",
  crossings: "/crossings",
  screener: "/screener",
  stock: "/stock",
};

export type HotkeyContext = {
  page: Section;
  ma: string;
  prev?: string | null;
  next?: string | null;
  /** The route the arrows step through, when it isn't the page's own (a stock's card). */
  base?: string;
  /** Already-validated params to keep when stepping, e.g. "&h=1y". */
  extra?: string;
};

/**
 * Where a key goes, or null if it does nothing here. Pure, so the routing is
 * tested without a browser. Arrows step sessions on the current page; 1–3
 * switch the average, except on a Report Card, which has none to switch.
 */
export function hotkeyTarget(key: string, c: HotkeyContext): string | null {
  const base = c.base ?? BASE[c.page];
  const extra = c.extra ?? "";
  if (key === "ArrowLeft") return c.prev ? `${base}?ma=${c.ma}&date=${c.prev}${extra}` : null;
  if (key === "ArrowRight") return c.next ? `${base}?ma=${c.ma}&date=${c.next}${extra}` : null;
  if (key === "1" || key === "2" || key === "3") {
    if (c.page === "stock") return null;
    return `${base}?ma=${{ "1": "sma200", "2": "ema200", "3": "sma50" }[key]}`;
  }
  if (key === "b") return `/?ma=${c.ma}`;
  if (key === "a") return `/advance-decline?ma=${c.ma}`;
  if (key === "c") return `/crossings?ma=${c.ma}`;
  if (key === "s") return `/screener?ma=${c.ma}`;
  if (key === "r") return "/stock";
  return null;
}
