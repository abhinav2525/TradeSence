import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/** One line on Breadth while the washout alarm is Active (decision 0017). */
export default function WashoutNotice({ text, ma, className }: { text: string; ma: string; className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        "reveal flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-down/30 bg-down-soft px-4 py-2.5 text-body-sm leading-5 text-foreground",
        className,
      )}
    >
      <TriangleAlert className="size-4 shrink-0 text-down" aria-hidden="true" />
      <span><strong className="font-semibold text-down">Washout:</strong> {text}</span>
      <Link href={`/signals?ma=${ma}`} className="ml-auto font-medium text-brand hover:underline">See Signals →</Link>
    </div>
  );
}
