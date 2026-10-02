import { cn } from "@/lib/utils";
import type { Light } from "@/indicators/risk";

const COPY: Record<Light, string> = { green: "Green", amber: "Amber", red: "Red" };

/**
 * A traffic light that never relies on colour alone: it always carries its
 * word. The design system has no amber hue, so amber is a neutral ring.
 */
export default function LightDot({ light, className }: { light: Light | null; className?: string }) {
  if (!light) return <span className={cn("text-[12px] text-muted-foreground", className)}>Not enough history</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-medium", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "pop-in size-2.5 rounded-full",
          light === "green" ? "bg-up" : light === "red" ? "bg-down" : "bg-chart-muted ring-2 ring-inset ring-foreground/40",
        )}
      />
      <span className={light === "green" ? "text-up" : light === "red" ? "text-down" : "text-foreground-2"}>{COPY[light]}</span>
    </span>
  );
}
