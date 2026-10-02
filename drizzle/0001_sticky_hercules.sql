CREATE TABLE "corporate_actions" (
	"symbol" text NOT NULL,
	"ex_date" date NOT NULL,
	"subject" text NOT NULL,
	"series" text NOT NULL,
	"kind" text NOT NULL,
	"factor" double precision,
	"company" text,
	"record_date" date,
	CONSTRAINT "corporate_actions_symbol_ex_date_subject_pk" PRIMARY KEY("symbol","ex_date","subject")
);
--> statement-breakpoint
CREATE INDEX "corporate_actions_ex_date_idx" ON "corporate_actions" USING btree ("ex_date");