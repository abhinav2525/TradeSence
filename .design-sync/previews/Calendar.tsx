import { Calendar } from "tradesence";

const session = new Date(2026, 9, 1);

export const SingleSession = () => (
  <div style={{ width: 300, padding: 16 }}>
    <Calendar
      mode="single"
      selected={session}
      defaultMonth={session}
      today={session}
      weekStartsOn={1}
      disabled={{ after: session }}
      className="rounded-lg border"
    />
  </div>
);

export const DropdownCaption = () => (
  <div style={{ width: 300, padding: 16 }}>
    <Calendar
      mode="single"
      selected={session}
      defaultMonth={session}
      today={session}
      captionLayout="dropdown"
      startMonth={new Date(2020, 0, 1)}
      endMonth={session}
      weekStartsOn={1}
      disabled={[{ before: new Date(2020, 0, 1) }, { after: session }]}
      className="rounded-lg border"
    />
  </div>
);

export const RangeSelection = () => (
  <div style={{ width: 300, padding: 16 }}>
    <Calendar
      mode="range"
      selected={{ from: new Date(2026, 8, 22), to: new Date(2026, 9, 1) }}
      defaultMonth={new Date(2026, 8, 1)}
      today={session}
      weekStartsOn={1}
      className="rounded-lg border"
    />
  </div>
);
