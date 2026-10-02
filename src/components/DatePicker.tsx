"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate } from "@/lib/format";

type Props = {
  base: string;
  ma: string;
  date: string | null;
  min: string | null;
  max: string | null;
  /** Other already-validated params to keep, e.g. "&view=below&vol=2". */
  extra?: string;
};

// Calendar days are local dates; build and read them field by field so a
// timezone offset can never move the session by a day.
const toDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
};
const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * shadcn's date picker (Popover + Calendar). Picking a day navigates at once.
 * Weekends stay selectable: NSE trades on some (decision 0007), and a day that
 * wasn't a session snaps back to the one before it, with a note saying so.
 */
export default function DatePicker({ base, ma, date, min, max, extra = "" }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const selected = date ? toDate(date) : undefined;
  const first = min ? toDate(min) : undefined;
  const last = max ? toDate(max) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Session date: ${formatDate(date)}. Choose another`}
          className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-input bg-transparent px-2.5 text-[12px] tabular-nums text-foreground transition-colors hover:bg-raised"
        >
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
          {date ? formatDate(date) : "Pick a session"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? last}
          captionLayout="dropdown"
          startMonth={first}
          endMonth={last}
          weekStartsOn={1}
          disabled={[...(first ? [{ before: first }] : []), ...(last ? [{ after: last }] : [])]}
          onSelect={(d) => {
            if (!d) return;
            setOpen(false);
            router.push(`${base}?ma=${ma}&date=${toIso(d)}${extra}`);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
