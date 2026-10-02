CREATE TABLE "symbol_changes" (
	"old_symbol" text NOT NULL,
	"new_symbol" text NOT NULL,
	"changed_on" date NOT NULL,
	"company" text,
	CONSTRAINT "symbol_changes_old_symbol_new_symbol_changed_on_pk" PRIMARY KEY("old_symbol","new_symbol","changed_on")
);
--> statement-breakpoint
CREATE INDEX "symbol_changes_new_symbol_idx" ON "symbol_changes" USING btree ("new_symbol");