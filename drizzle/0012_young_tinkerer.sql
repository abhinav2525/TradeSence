CREATE TABLE "volume_leaders" (
	"as_of" date NOT NULL,
	"symbol" text NOT NULL,
	"period" integer NOT NULL,
	"turnover" double precision NOT NULL,
	"shares" double precision NOT NULL,
	"change_pct" double precision,
	"sessions" integer NOT NULL,
	"unusual_days" integer NOT NULL,
	CONSTRAINT "volume_leaders_symbol_period_pk" PRIMARY KEY("symbol","period")
);
