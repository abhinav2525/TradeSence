CREATE TABLE "daily_indicators" (
	"trade_date" date NOT NULL,
	"symbol" text NOT NULL,
	"close" double precision NOT NULL,
	"sma_50" double precision,
	"sma_200" double precision,
	"ema_200" double precision,
	CONSTRAINT "daily_indicators_trade_date_symbol_pk" PRIMARY KEY("trade_date","symbol")
);
--> statement-breakpoint
CREATE TABLE "daily_prices" (
	"trade_date" date NOT NULL,
	"symbol" text NOT NULL,
	"series" text NOT NULL,
	"open" double precision NOT NULL,
	"high" double precision NOT NULL,
	"low" double precision NOT NULL,
	"close" double precision NOT NULL,
	"prev_close" double precision NOT NULL,
	"volume" bigint NOT NULL,
	"turnover" double precision NOT NULL,
	CONSTRAINT "daily_prices_trade_date_symbol_series_pk" PRIMARY KEY("trade_date","symbol","series")
);
--> statement-breakpoint
CREATE TABLE "index_members" (
	"index_name" text NOT NULL,
	"symbol" text NOT NULL,
	"added_on" date NOT NULL,
	"removed_on" date,
	CONSTRAINT "index_members_index_name_symbol_added_on_pk" PRIMARY KEY("index_name","symbol","added_on")
);
--> statement-breakpoint
CREATE TABLE "ingest_log" (
	"trade_date" date NOT NULL,
	"source" text NOT NULL,
	"format" text,
	"status" text NOT NULL,
	"row_count" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingest_log_trade_date_source_pk" PRIMARY KEY("trade_date","source")
);
--> statement-breakpoint
CREATE INDEX "daily_prices_symbol_date_idx" ON "daily_prices" USING btree ("symbol","trade_date");