CREATE TABLE "index_constituents" (
	"index_key" text NOT NULL,
	"symbol" text NOT NULL,
	"industry" text NOT NULL,
	"fetched_on" date NOT NULL,
	CONSTRAINT "index_constituents_index_key_symbol_pk" PRIMARY KEY("index_key","symbol")
);
--> statement-breakpoint
CREATE INDEX "index_constituents_symbol_idx" ON "index_constituents" USING btree ("symbol");