CREATE TABLE "sector_flow_weeks" (
	"week_end" date NOT NULL,
	"sector" text NOT NULL,
	"ratio" double precision,
	"median_move" double precision,
	"stocks" integer NOT NULL,
	"short_session" boolean NOT NULL,
	CONSTRAINT "sector_flow_weeks_sector_week_end_pk" PRIMARY KEY("sector","week_end")
);
--> statement-breakpoint
CREATE TABLE "short_sessions" (
	"trade_date" date PRIMARY KEY NOT NULL,
	"market_turnover" double precision NOT NULL,
	"usual_turnover" double precision NOT NULL
);
--> statement-breakpoint
ALTER TABLE "money_flow" DROP CONSTRAINT "money_flow_symbol_period_pk";--> statement-breakpoint
ALTER TABLE "money_flow" ADD CONSTRAINT "money_flow_period_symbol_pk" PRIMARY KEY("period","symbol");