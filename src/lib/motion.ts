import { useEffect, useRef, useSyncExternalStore } from "react";

/** Milliseconds; mirrors --motion-* in globals.css (a test keeps them equal). */
export const MOTION = { fast: 150, base: 300, slow: 600 } as const;
export const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

const QUERY = "(prefers-reduced-motion: reduce)";

/** True when the reader asked their device for less motion. Always false on the server. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const m = window.matchMedia(QUERY);
  m.addEventListener("change", onChange);
  return () => m.removeEventListener("change", onChange);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}

export type ChartAnimation = { isAnimationActive: boolean; animationDuration: number; animationEasing: "ease-out" };

/** The props every Recharts series spreads: the one switch for chart motion. */
export function chartAnimation(reduced: boolean, first: boolean): ChartAnimation {
  return { isAnimationActive: !reduced, animationDuration: first ? MOTION.slow : MOTION.base, animationEasing: "ease-out" };
}

/** Slow draw-in on the first render, a quicker morph on every later data change. */
export function useChartAnimation(): ChartAnimation {
  const reduced = useReducedMotion();
  const first = useRef(true);
  useEffect(() => {
    first.current = false;
  }, []);
  return chartAnimation(reduced, first.current);
}
