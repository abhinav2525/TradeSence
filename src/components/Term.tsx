"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GLOSSARY, termHref, todayLine, type TermId } from "@/lib/glossary";
import { cn } from "@/lib/utils";

type Props = { id: TermId; today?: string; children?: React.ReactNode; className?: string };

/**
 * A label with an ⓘ that explains it in place. Never put this inside a <Link>
 * or a clickable row: the ⓘ is a button of its own.
 */
export default function Term({ id, today, children, className }: Props) {
  const e = GLOSSARY[id];
  const now = todayLine(today);
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span>{children ?? e.term}</span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`What is ${e.term}?`}
            className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-brand focus-visible:text-brand"
          >
            <Info className="size-3.5" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" collisionPadding={16} className="w-[min(18rem,calc(100vw-2rem))] p-4 text-left">
          <p className="text-heading text-foreground">{e.term}</p>
          <p className="mt-1.5 text-[13px] font-normal normal-case leading-5 tracking-normal text-foreground-2">{e.short}</p>
          <p className="mt-2 text-[12px] font-normal normal-case leading-4 tracking-normal text-foreground-2">
            <span className="font-medium text-foreground">How to read it: </span>
            {e.read}
          </p>
          {now && (
            <p className="mt-2 text-[12px] font-normal normal-case leading-4 tracking-normal tabular-nums text-foreground-2">
              <span className="font-medium text-foreground">Today: </span>
              {now}
            </p>
          )}
          <Link href={termHref(id)} className="mt-3 inline-block text-[12px] font-medium normal-case tracking-normal text-brand hover:underline">
            Read more →
          </Link>
        </PopoverContent>
      </Popover>
    </span>
  );
}
