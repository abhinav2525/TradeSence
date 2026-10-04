CREATE TABLE "daily_delivery" (
	"trade_date" date NOT NULL,
	"symbol" text NOT NULL,
	"series" text NOT NULL,
	"traded_qty" bigint NOT NULL,
	"deliverable_qty" bigint NOT NULL,
	CONSTRAINT "daily_delivery_trade_date_symbol_series_pk" PRIMARY KEY("trade_date","symbol","series")
);
--> statement-breakpoint
CREATE INDEX "daily_delivery_symbol_date_idx" ON "daily_delivery" USING btree ("symbol","trade_date");