import {
  pgTable, date, text, doublePrecision, bigint, integer, timestamp, primaryKey, index,
} from "drizzle-orm/pg-core";

/**
 * Every NSE cash-market close we have ever downloaded.
 *
 * Deliberately stores the whole market, not just NIFTY 50: bhavcopy contains
 * everything anyway, so keeping it all means changing universe later is a query
 * change rather than a re-download.
 *
 * Prices are doublePrecision rather than numeric. These feed moving averages,
 * not ledgers — float math is the right trade for avoiding string parsing on
 * every read, and NSE quotes to 2dp.
 */
export const dailyPrices = pgTable(
  "daily_prices",
  {
    tradeDate: date("trade_date").notNull(),
    symbol: text("symbol").notNull(),
    series: text("series").notNull(),
    open: doublePrecision("open").notNull(),
    high: doublePrecision("high").notNull(),
    low: doublePrecision("low").notNull(),
    close: doublePrecision("close").notNull(),
    prevClose: doublePrecision("prev_close").notNull(),
    volume: bigint("volume", { mode: "number" }).notNull(),
    turnover: doublePrecision("turnover").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tradeDate, t.symbol, t.series] }),
    index("daily_prices_symbol_date_idx").on(t.symbol, t.tradeDate),
  ],
);

/**
 * Index membership, modelled point-in-time from day one.
 *
 * v1 seeds only today's NIFTY 50 with a single open interval, which makes the
 * historical breadth chart survivorship-biased (see plan). Fixing that later is
 * a matter of inserting closed intervals — no re-ingest.
 */
export const indexMembers = pgTable(
  "index_members",
  {
    indexName: text("index_name").notNull(),
    symbol: text("symbol").notNull(),
    addedOn: date("added_on").notNull(),
    removedOn: date("removed_on"), // null = still a member
  },
  (t) => [primaryKey({ columns: [t.indexName, t.symbol, t.addedOn] })],
);

/** Derived moving averages. Always recomputable from dailyPrices. */
export const dailyIndicators = pgTable(
  "daily_indicators",
  {
    tradeDate: date("trade_date").notNull(),
    symbol: text("symbol").notNull(),
    close: doublePrecision("close").notNull(),
    sma50: doublePrecision("sma_50"),
    sma200: doublePrecision("sma_200"),
    ema200: doublePrecision("ema_200"),
    // % move from the previous session, on the split/demerger-adjusted series
    // joined across renames; null on a segment's first day. bhavcopy's
    // prev_close can't be used: it isn't adjusted on an ex-date.
    changePct: doublePrecision("change_pct"),
  },
  (t) => [primaryKey({ columns: [t.tradeDate, t.symbol] })],
);

/**
 * NSE corporate actions — splits, bonuses, dividends, meetings — for the whole
 * market, exactly as NSE words them.
 *
 * Bhavcopy prices are unadjusted, so a 1:5 split looks like an 80% crash. The
 * `factor` here is what closes *before* `exDate` must be divided by to be
 * comparable with closes on and after it: 5 for a 1:5 split, 1.5 for a 1:2
 * bonus, 0.1 for a 10:1 consolidation, 1 for anything that leaves the share
 * count alone. `kind = 'unparsed'` with a null factor marks a share-count event
 * whose wording we could not read; it is kept so it can be reported, and never
 * guessed at. See docs/decisions/0002-split-adjusted-averages.md.
 */
export const corporateActions = pgTable(
  "corporate_actions",
  {
    symbol: text("symbol").notNull(),
    exDate: date("ex_date").notNull(),
    subject: text("subject").notNull(), // NSE's own text, verbatim
    series: text("series").notNull(),
    kind: text("kind").notNull(), // split | bonus | bonus+split | consolidation | demerger | other | unparsed
    // null only when kind = 'unparsed'. For a demerger this is 1: NSE gives no
    // ratio, so it is derived from prices at compute time (docs/decisions/0004).
    factor: doublePrecision("factor"),
    company: text("company"),
    recordDate: date("record_date"),
  },
  (t) => [
    primaryKey({ columns: [t.symbol, t.exDate, t.subject] }),
    index("corporate_actions_ex_date_idx").on(t.exDate),
  ],
);

/**
 * NSE ticker renames (ZOMATO -> ETERNAL), from NSE's symbolchange.csv.
 *
 * Bhavcopy uses whatever symbol was current on each day, so without this a
 * renamed company's history appears to start on the rename date. The old
 * symbol's prices are joined on at compute time; `daily_prices` is never
 * rewritten. See docs/decisions/0003-renamed-symbols-lose-history.md.
 */
export const symbolChanges = pgTable(
  "symbol_changes",
  {
    oldSymbol: text("old_symbol").notNull(),
    newSymbol: text("new_symbol").notNull(),
    changedOn: date("changed_on").notNull(), // first day trading under newSymbol
    company: text("company"),
  },
  (t) => [
    primaryKey({ columns: [t.oldSymbol, t.newSymbol, t.changedOn] }),
    index("symbol_changes_new_symbol_idx").on(t.newSymbol),
  ],
);

/**
 * Daily open/high/low/close of every NSE index (NIFTY 50, Next 50, 500, …),
 * from NSE's ind_close_all file. Stores all indices, like daily_prices stores
 * all stocks. Used to measure what the index did after a breadth reading.
 */
export const indexPrices = pgTable(
  "index_prices",
  {
    tradeDate: date("trade_date").notNull(),
    indexName: text("index_name").notNull(), // as NSE writes it, e.g. "Nifty 50"
    open: doublePrecision("open"),
    high: doublePrecision("high"),
    low: doublePrecision("low"),
    close: doublePrecision("close").notNull(),
  },
  (t) => [primaryKey({ columns: [t.tradeDate, t.indexName] })],
);

/** One row per attempted ingest. Drives both idempotency and backfill resume. */
export const ingestLog = pgTable(
  "ingest_log",
  {
    tradeDate: date("trade_date").notNull(),
    source: text("source").notNull(),
    format: text("format"),
    status: text("status").notNull(), // 'ok' | 'holiday' | 'error'
    rowCount: integer("row_count"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tradeDate, t.source] })],
);
