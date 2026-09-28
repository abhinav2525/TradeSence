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
  },
  (t) => [primaryKey({ columns: [t.tradeDate, t.symbol] })],
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
