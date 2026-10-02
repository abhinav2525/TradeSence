/**
 * NSE corporate actions: the record of every split and bonus, used to make
 * bhavcopy's unadjusted prices comparable across those events.
 *
 * Source: NSE's public JSON feed, one request per date range for the whole
 * market. It answers without the cookie handshake the main site demands, which
 * NSE could change — so a failed fetch is reported, never treated as "no
 * actions". Why this source over a broker API or TradingView:
 * docs/decisions/0002-split-adjusted-averages.md.
 */
import { sql } from "drizzle-orm";
import { db, schema } from "../db";
import { download } from "./bhavcopy";

export type ActionKind =
  | "split" | "bonus" | "bonus+split" | "consolidation" | "demerger" | "other" | "unparsed";

export type Classified = { kind: ActionKind; factor: number | null };

export type CorporateAction = {
  symbol: string;
  exDate: string; // ISO yyyy-mm-dd
  subject: string;
  series: string;
  kind: ActionKind;
  factor: number | null;
  company: string | null;
  recordDate: string | null;
};

/** Equity series, matching what `daily_prices` keeps. Bond series are dropped. */
const KEEP_SERIES = new Set(["EQ", "BE"]);

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

/** "14-Jan-2026" -> "2026-01-14"; anything else (NSE uses "-") -> null. */
export function parseExDate(raw: string | null | undefined): string | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec((raw ?? "").trim());
  if (!m) return null;
  const month = MONTHS.indexOf(m[2]!.toUpperCase());
  if (month < 0) return null;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
}

// A rupee amount as NSE writes it: "Rs 10/-", "Rs10/-", "Re 1", "Rs.10".
const AMOUNT = String.raw`R[se]\.?\s*(\d+(?:\.\d+)?)`;
const SPLIT = new RegExp(String.raw`(?:From\s*)?${AMOUNT}.*?To\s*${AMOUNT}`, "i");
const BONUS = /\bBonus\b\s*-?\s*(\d+)\s*:\s*(\d+)/i;

/** Bonuses of preference shares or debentures leave the equity count alone. */
const NON_EQUITY = /crps|debenture|preference/i;

// NSE sometimes abbreviates: "Fv Splt Frm Rs 10 To Re 1" (JSWSTEEL, 2017).
const SPLIT_WORD = /split|splt|sub-?division|consolidat/i;

/** Wording that changes the share count. If present but unreadable -> unparsed. */
const SHARE_COUNT = /split|splt|sub-?division|bonus|consolidat|capital reduction|reduction of capital/i;

/**
 * Reads one NSE `subject` into the factor that closes before the ex-date must
 * be divided by.
 *
 * NSE joins several events into one subject with "/" or "+" ("Bonus 1:1/Face
 * Value Split ..."), so each clause is read on its own and the factors multiply.
 * The "/" in "Rs 10/-" is part of an amount, not a separator, hence `(?!-)`.
 *
 * A demerger's text carries no ratio ("Demerger", "Scheme Of Demerger"), so it
 * is returned with factor 1 and the ratio is worked out from prices at compute
 * time (`demergerFactor`). See docs/decisions/0004-demerger-adjustment.md.
 *
 * The one rule that matters: a clause that talks about the share count but
 * cannot be read makes the whole subject `unparsed`. Quietly returning 1 would
 * leave that split unadjusted with nothing to signal it.
 */
export function classifyAction(subject: string): Classified {
  const kinds: ActionKind[] = [];
  let factor = 1;

  for (const clause of subject.split(/\/(?!\s*-)|\+/)) {
    if (/demerg/i.test(clause)) {
      kinds.push("demerger");
      continue;
    }
    if (!SHARE_COUNT.test(clause)) continue;
    if (/bonus/i.test(clause) && NON_EQUITY.test(clause)) continue;

    if (/capital reduction|reduction of capital/i.test(clause)) {
      return { kind: "unparsed", factor: null };
    }

    if (SPLIT_WORD.test(clause)) {
      const m = SPLIT.exec(clause);
      const from = Number(m?.[1]);
      const to = Number(m?.[2]);
      if (!m || !(from > 0) || !(to > 0)) return { kind: "unparsed", factor: null };
      factor *= from / to;
      kinds.push(/consolidat/i.test(clause) ? "consolidation" : "split");
      continue;
    }

    const m = BONUS.exec(clause);
    const issued = Number(m?.[1]);
    const held = Number(m?.[2]);
    if (!m || !(issued > 0) || !(held > 0)) return { kind: "unparsed", factor: null };
    factor *= (issued + held) / held;
    kinds.push("bonus");
  }

  if (kinds.length === 0) return { kind: "other", factor: 1 };
  if (kinds.length === 1) return { kind: kinds[0]!, factor };
  if (kinds.includes("bonus") && kinds.includes("split") && kinds.length === 2) {
    return { kind: "bonus+split", factor };
  }
  return { kind: "unparsed", factor: null };
}

type NseRow = {
  symbol?: string; series?: string; subject?: string;
  exDate?: string; recDate?: string; comp?: string;
};

export type FetchActionsResult =
  | { status: "ok"; rows: CorporateAction[]; skipped: number }
  | { status: "error"; message: string };

const ddmmyyyy = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
};

export function corporateActionsUrl(fromIso: string, toIso: string): string {
  return "https://www.nseindia.com/api/corporates-corporateActions?index=equities" +
    `&from_date=${ddmmyyyy(fromIso)}&to_date=${ddmmyyyy(toIso)}`;
}

/**
 * Every equity corporate action with an ex-date in [fromIso, toIso].
 *
 * A row with no usable ex-date cannot be placed on the timeline, so it is
 * skipped and counted rather than given a made-up date.
 */
export async function fetchCorporateActions(
  fromIso: string,
  toIso: string,
  deps: { download?: typeof download } = {},
): Promise<FetchActionsResult> {
  const get = deps.download ?? download;
  const res = await get(corporateActionsUrl(fromIso, toIso));
  if (res.kind !== "ok") {
    return { status: "error", message: res.kind === "failed" ? res.message : "HTTP 404" };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(res.bytes));
  } catch {
    return { status: "error", message: "corporate actions response was not JSON" };
  }
  if (!Array.isArray(raw)) {
    return { status: "error", message: "corporate actions response was not a list" };
  }

  const rows: CorporateAction[] = [];
  let skipped = 0;
  for (const r of raw as NseRow[]) {
    if (!r.symbol || !r.subject || !KEEP_SERIES.has(r.series ?? "")) continue;
    const exDate = parseExDate(r.exDate);
    if (!exDate) { skipped += 1; continue; }
    const { kind, factor } = classifyAction(r.subject);
    rows.push({
      symbol: r.symbol, exDate, subject: r.subject.trim(), series: r.series!,
      kind, factor, company: r.comp ?? null, recordDate: parseExDate(r.recDate),
    });
  }
  return { status: "ok", rows, skipped };
}

export type IngestActionsResult =
  | { status: "ok"; stored: number; unparsed: number; skipped: number }
  | { status: "error"; message: string };

/** Fetches a range and upserts it. Safe to re-run over overlapping ranges. */
export async function ingestCorporateActions(
  fromIso: string,
  toIso: string,
  deps: { download?: typeof download } = {},
): Promise<IngestActionsResult> {
  const res = await fetchCorporateActions(fromIso, toIso, deps);
  if (res.status === "error") return res;

  // NSE occasionally lists the same action twice; the batch must not collide
  // with itself on the primary key.
  const unique = new Map(res.rows.map((r) => [`${r.symbol}|${r.exDate}|${r.subject}`, r]));
  const rows = [...unique.values()];

  for (let i = 0; i < rows.length; i += 1000) {
    await db
      .insert(schema.corporateActions)
      .values(rows.slice(i, i + 1000))
      .onConflictDoUpdate({
        target: [
          schema.corporateActions.symbol,
          schema.corporateActions.exDate,
          schema.corporateActions.subject,
        ],
        set: {
          series: sql`excluded.series`,
          kind: sql`excluded.kind`,
          factor: sql`excluded.factor`,
          company: sql`excluded.company`,
          recordDate: sql`excluded.record_date`,
        },
      });
  }

  return {
    status: "ok",
    stored: rows.length,
    unparsed: rows.filter((r) => r.kind === "unparsed").length,
    skipped: res.skipped,
  };
}
