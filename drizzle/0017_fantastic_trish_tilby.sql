CREATE TABLE "sector_share_year" (
	"sector" text PRIMARY KEY NOT NULL,
	"stocks" integer NOT NULL,
	"now_turnover" double precision NOT NULL,
	"now_total" double precision NOT NULL,
	"ago_turnover" double precision NOT NULL,
	"ago_total" double precision NOT NULL,
	"new_listing_turnover" double precision NOT NULL,
	"now_from" date NOT NULL,
	"now_to" date NOT NULL,
	"ago_from" date NOT NULL,
	"ago_to" date NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sector_flow_weeks" ADD COLUMN "turnover" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sector_flow_weeks" ADD COLUMN "total_turnover" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sector_flow_weeks" ADD COLUMN "new_listing_turnover" double precision;