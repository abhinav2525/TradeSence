import {
  pgTable, date, text, doublePrecision, bigint, integer, timestamp, primaryKey, index, boolean,
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
 * Loaded from the hand-kept src/ingest/nifty50-history.csv: every member since
 * 2020 with the day it joined and the first day it was out, so each day's
 * breadth uses that day's real index (decision 0005, no survivorship bias).
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
    // Volume ÷ mean of the 20 prior sessions, in split/bonus-adjusted share
    // units (never demerger-adjusted). For the Screener (decision 0009).
    volRatio: doublePrecision("vol_ratio"),
    // ₹ traded that session (bhavcopy turnover, both formats in rupees), on the
    // rename-joined series. For the Report Card's liquidity check (decision 0011).
    turnover: doublePrecision("turnover"),
  },
  (t) => [
    primaryKey({ columns: [t.tradeDate, t.symbol] }),
    // The key serves "every stock on a day" (breadth); this serves "one stock
    // over time" (Report Card), which otherwise reads the whole table (0021).
    index("daily_indicators_symbol_date_idx").on(t.symbol, t.tradeDate),
  ],
);

/**
 * Shares traded and shares actually delivered (bought and kept, not squared
 * off the same day), per stock per day, from NSE's MTO_DDMMYYYY.DAT.
 *
 * Its own table rather than columns on daily_prices (decision 0021): it is a
 * separate file that can fail on its own, and filling new columns would
 * rewrite every price row. Same key as daily_prices, so the two join on it.
 * Delivery % is deliverable ÷ traded; it isn't stored, because NSE's copy is
 * rounded. Quantities are raw shares on the day, like volume: not adjusted
 * for splits, which leaves the ratio unchanged.
 * Only EQ: NSE leaves BE (trade-for-trade, always 100% delivered) out.
 */
export const dailyDelivery = pgTable(
  "daily_delivery",
  {
    tradeDate: date("trade_date").notNull(),
    symbol: text("symbol").notNull(),
    series: text("series").notNull(),
    tradedQty: bigint("traded_qty", { mode: "number" }).notNull(),
    deliverableQty: bigint("deliverable_qty", { mode: "number" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tradeDate, t.symbol, t.series] }),
    index("daily_delivery_symbol_date_idx").on(t.symbol, t.tradeDate),
  ],
);

/**
 * Each session's unusual stock-days (Unusual activity page): only days where at
 * least one of the four kinds fired, for liquid companies (ETFs out). Rebuilt in
 * full each night from daily_prices + daily_delivery by computeUnusualDays, so a
 * late corporate action re-adjusts history. `symbol` is today's symbol (history
 * joined across renames). Spec: docs/superpowers/specs/2026-10-04-unusual-activity-design.md.
 */
export const unusualDays = pgTable(
  "unusual_days",
  {
    tradeDate: date("trade_date").notNull(),
    symbol: text("symbol").notNull(),
    kept: boolean("kept").notNull(),
    volume: boolean("volume").notNull(),
    jump: boolean("jump").notNull(),
    collapse: boolean("collapse").notNull(),
    keptRatio: doublePrecision("kept_ratio"),
    volumeRatio: doublePrecision("volume_ratio"),
    deliveryPct: doublePrecision("delivery_pct"),
    usualDeliveryPct: doublePrecision("usual_delivery_pct"),
    changePct: doublePrecision("change_pct"),
    turnover: doublePrecision("turnover").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tradeDate, t.symbol] }),
    index("unusual_days_symbol_date_idx").on(t.symbol, t.tradeDate),
  ],
);

/**
 * Fund symbols (ETFs: ISIN starting "INF") seen in bhavcopy since the committed
 * list (src/indicators/fund-symbols.txt) was written. Topped up nightly so a new
 * ETF never shows up as an "unusual" company (decision 0024, final review).
 */
export const fundSymbols = pgTable("fund_symbols", {
  symbol: text("symbol").primaryKey(),
  firstSeen: date("first_seen").notNull(),
});

/**
 * Today's members of NSE indices (Top volume page): one row per index and stock,
 * from NSE's ind_*list.csv files, replaced per index each night. A failed
 * download keeps yesterday's rows. `industry` is NSE's sector for the stock.
 */
export const indexConstituents = pgTable(
  "index_constituents",
  {
    indexKey: text("index_key").notNull(),
    symbol: text("symbol").notNull(),
    industry: text("industry").notNull(),
    fetchedOn: date("fetched_on").notNull(),
  },
  (t) => [primaryKey({ columns: [t.indexKey, t.symbol] }), index("index_constituents_symbol_idx").on(t.symbol)],
);

/**
 * Top volume page: each Nifty Total Market stock's totals over the last 1, 5, 21,
 * 63 and 126 market sessions ending `as_of`. Rebuilt in full nightly in one
 * transaction. `shares` are split/bonus-adjusted to today's share terms.
 */
export const volumeLeaders = pgTable(
  "volume_leaders",
  {
    asOf: date("as_of").notNull(),
    symbol: text("symbol").notNull(),
    period: integer("period").notNull(),
    turnover: doublePrecision("turnover").notNull(),
    shares: doublePrecision("shares").notNull(),
    changePct: doublePrecision("change_pct"),
    sessions: integer("sessions").notNull(),
    unusualDays: integer("unusual_days").notNull(),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.period] })],
);

/**
 * Money flow page (spec 2026-10-05): each Nifty Total Market stock's ₹ traded over
 * the last 1, 5 and 21 sessions ending `as_of`, its normal ₹ per session over the
 * 63 sessions before that window (null with fewer than 40 traded), and its sector.
 * Rebuilt in full nightly in one transaction; the page sums per sector.
 */
export const moneyFlow = pgTable(
  "money_flow",
  {
    asOf: date("as_of").notNull(),
    symbol: text("symbol").notNull(),
    sector: text("sector").notNull(),
    period: integer("period").notNull(),
    turnover: doublePrecision("turnover").notNull(),
    normalDaily: doublePrecision("normal_daily"),
    sessions: integer("sessions").notNull(),
    changePct: doublePrecision("change_pct"),
  },
  // period first: the page always reads one period (decision 0029)
  (t) => [primaryKey({ columns: [t.period, t.symbol] })],
);

/**
 * Money flow history: each sector's 1-week trading vs normal for the last 52 weeks
 * (week k = sessions 5k … 5k+4; week 0 = the page's 1-week bar). Keyed by how the
 * page reads it: one sector, in week order. Rebuilt nightly with money_flow.
 */
export const sectorFlowWeeks = pgTable(
  "sector_flow_weeks",
  {
    weekEnd: date("week_end").notNull(),
    sector: text("sector").notNull(),
    ratio: doublePrecision("ratio"),
    medianMove: doublePrecision("median_move"),
    stocks: integer("stocks").notNull(),
    shortSession: boolean("short_session").notNull(),
  },
  (t) => [primaryKey({ columns: [t.sector, t.weekEnd] })],
);

/**
 * Sessions where the Nifty Total Market traded under half its usual day (Diwali
 * Muhurat, special Saturdays): every sector looks quiet then. Found nightly so the
 * page doesn't sum daily_prices on every view.
 */
export const shortSessions = pgTable("short_sessions", {
  tradeDate: date("trade_date").primaryKey(),
  marketTurnover: doublePrecision("market_turnover").notNull(),
  usualTurnover: doublePrecision("usual_turnover").notNull(),
});

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
