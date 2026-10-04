CREATE TABLE "money_flow" (
	"as_of" date NOT NULL,
	"symbol" text NOT NULL,
	"sector" text NOT NULL,
	"period" integer NOT NULL,
	"turnover" double precision NOT NULL,
	"normal_daily" double precision,
	"sessions" integer NOT NULL,
	"change_pct" double precision,
	CONSTRAINT "money_flow_symbol_period_pk" PRIMARY KEY("symbol","period")
);
