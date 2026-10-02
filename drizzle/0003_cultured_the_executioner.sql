CREATE TABLE "index_prices" (
	"trade_date" date NOT NULL,
	"index_name" text NOT NULL,
	"open" double precision,
	"high" double precision,
	"low" double precision,
	"close" double precision NOT NULL,
	CONSTRAINT "index_prices_trade_date_index_name_pk" PRIMARY KEY("trade_date","index_name")
);
