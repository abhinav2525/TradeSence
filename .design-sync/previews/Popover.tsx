import { Popover, PopoverTrigger, PopoverContent, Calendar } from "tradesence";

export const TermExplainer = () => (
  <div style={{ width: 360, height: 300, padding: 16 }}>
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="What is Breadth?"
          className="inline-flex items-center gap-1 text-[13px] text-foreground"
        >
          Breadth <span className="text-brand">ⓘ</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(18rem,calc(100vw-2rem))] p-4 text-left">
        <p className="text-heading text-foreground">Breadth</p>
        <p className="mt-1.5 text-[13px] leading-5 text-foreground-2">
          The share of NIFTY 50 stocks trading above their own moving average.
        </p>
        <p className="mt-2 text-[12px] leading-4 text-foreground-2">
          <span className="font-medium text-foreground">How to read it: </span>
          Above 80% is stretched; below 20% is washed out.
        </p>
        <p className="mt-2 text-[12px] leading-4 tabular-nums text-foreground-2">
          <span className="font-medium text-foreground">Today: </span>
          16% on 1 Oct 2026
        </p>
        <span className="mt-3 inline-block text-[12px] font-medium text-brand">Read more →</span>
      </PopoverContent>
    </Popover>
  </div>
);

export const SessionPicker = () => (
  <div style={{ width: 360, height: 400, padding: 16 }} className="flex justify-end">
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-input bg-transparent px-2.5 text-[12px] tabular-nums text-foreground transition-colors hover:bg-raised"
        >
          1 Oct 2026
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="single"
          selected={new Date(2026, 9, 1)}
          defaultMonth={new Date(2026, 9, 1)}
          today={new Date(2026, 9, 1)}
          weekStartsOn={1}
          disabled={{ after: new Date(2026, 9, 1) }}
        />
      </PopoverContent>
    </Popover>
  </div>
);
