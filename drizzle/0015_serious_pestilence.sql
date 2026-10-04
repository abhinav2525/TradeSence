CREATE TABLE "breadth_daily" (
	"universe" text NOT NULL,
	"ma" text NOT NULL,
	"trade_date" date NOT NULL,
	"above" integer NOT NULL,
	"total" integer NOT NULL,
	CONSTRAINT "breadth_daily_universe_ma_trade_date_pk" PRIMARY KEY("universe","ma","trade_date")
);
