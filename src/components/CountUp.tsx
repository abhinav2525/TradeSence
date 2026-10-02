"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { countFrame, countPlan, formatLike, parseShown } from "@/lib/count";
import { MOTION, prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * A figure that counts to its value: from 0 when it first appears, from what is
 * on screen when it changes. The server HTML is always the final text; screen
 * readers get it from the sr-only copy. Values that aren't plain figures ("—",
 * "12–80") render unchanged.
 */
export default function CountUp({ text, className }: { text: string; className?: string }) {
  const [shown, setShown] = useState(text);
  const box = useRef<HTMLSpanElement>(null);
  const onScreen = useRef<number | null>(null); // the value currently drawn, once counting has begun

  // layout effect: the first frame is set before the browser paints, so nothing flickers
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const target = parseShown(text);
    if (!target || prefersReducedMotion()) {
      onScreen.current = target?.value ?? null;
      setShown(text);
      el.dataset.counted = "";
      return;
    }
    const shownNow = el.lastElementChild ? getComputedStyle(el.lastElementChild).opacity === "1" : true;
    const plan = countPlan(onScreen.current, shownNow && !("counted" in el.dataset));
    if (!plan) {
      onScreen.current = target.value;
      setShown(text);
      el.dataset.counted = "";
      return;
    }
    const { from } = plan;
    const duration = MOTION[plan.duration];
    setShown(formatLike(target, from));
    el.dataset.counted = "";
    const start = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const t = (now - start) / duration;
      const v = countFrame(from, target.value, t);
      onScreen.current = v;
      if (t >= 1) {
        setShown(text);
        return;
      }
      setShown(formatLike(target, v));
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [text]);

  return (
    <span ref={box} className={cn("countup", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="select-none">{shown}</span>
    </span>
  );
}
