"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * The raised thumb of a segmented control, sliding to the selected option
 * (aria-pressed or aria-selected). It measures the selected option, so labels of
 * any width work. Without JavaScript the selected option keeps its own thumb:
 * the group only drops it once `data-pill` is set.
 */
export default function SlidingPill({ active }: { active: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const group = ref.current?.parentElement;
    if (!group) return;
    const measure = () => {
      const sel = group.querySelector<HTMLElement>('[aria-pressed="true"],[aria-selected="true"]');
      setBox(sel ? { left: sel.offsetLeft, width: sel.offsetWidth } : null);
    };
    measure();
    group.dataset.pill = "";
    const ro = new ResizeObserver(measure);
    ro.observe(group);
    return () => ro.disconnect();
  }, [active]);

  return <span ref={ref} aria-hidden="true" className={box ? "seg-pill" : "hidden"} style={box ?? undefined} />;
}
