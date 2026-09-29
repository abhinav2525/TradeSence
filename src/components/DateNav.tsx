import Link from "next/link";

type Props = {
  ma: string;
  date: string | null;
  requested: string | null;
  snapped: boolean;
  prev: string | null;
  next: string | null;
  min: string | null;
  max: string | null;
};

/**
 * A plain GET form, so the page stays a server component — no client state,
 * no date-picker dependency, and the selected day lives in the URL where it
 * can be bookmarked and shared.
 */
export default function DateNav({ ma, date, requested, snapped, prev, next, min, max }: Props) {
  return (
    <div className="datenav">
      <form method="get" action="/">
        <input type="hidden" name="ma" value={ma} />
        <label htmlFor="date">Session</label>
        <input
          type="date"
          id="date"
          name="date"
          defaultValue={date ?? undefined}
          min={min ?? undefined}
          max={max ?? undefined}
        />
        <button type="submit">Go</button>
      </form>

      <div className="stepper">
        {prev ? (
          <Link className="step" href={`/?ma=${ma}&date=${prev}`} rel="prev">← {prev}</Link>
        ) : (
          <span className="step disabled">← start of history</span>
        )}
        {next ? (
          <Link className="step" href={`/?ma=${ma}&date=${next}`} rel="next">{next} →</Link>
        ) : (
          <span className="step disabled">latest session →</span>
        )}
      </div>

      {snapped && requested && (
        <p className="snapped" role="status">
          {requested} was not a trading session — showing {date} instead.
        </p>
      )}
    </div>
  );
}
