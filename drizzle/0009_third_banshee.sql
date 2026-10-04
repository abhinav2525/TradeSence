CREATE TABLE "unusual_days" (
	"trade_date" date NOT NULL,
	"symbol" text NOT NULL,
	"kept" boolean NOT NULL,
	"volume" boolean NOT NULL,
	"jump" boolean NOT NULL,
	"collapse" boolean NOT NULL,
	"kept_ratio" double precision,
	"volume_ratio" double precision,
	"delivery_pct" double precision,
	"usual_delivery_pct" double precision,
	"change_pct" double precision,
	"turnover" double precision NOT NULL,
	CONSTRAINT "unusual_days_trade_date_symbol_pk" PRIMARY KEY("trade_date","symbol")
);
--> statement-breakpoint
CREATE INDEX "unusual_days_symbol_date_idx" ON "unusual_days" USING btree ("symbol","trade_date");