CREATE TABLE "tax_table_brackets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" smallint NOT NULL,
	"day_type" varchar(8) NOT NULL,
	"table_number" smallint NOT NULL,
	"income_from_ore" integer NOT NULL,
	"income_to_ore" integer NOT NULL,
	"tax_is_percent" boolean DEFAULT false NOT NULL,
	"tax_col_1" integer NOT NULL,
	"tax_col_2" integer NOT NULL,
	"tax_col_3" integer NOT NULL,
	"tax_col_4" integer NOT NULL,
	"tax_col_5" integer NOT NULL,
	"tax_col_6" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "tax_brackets_lookup_idx" ON "tax_table_brackets" USING btree ("year","day_type","table_number","income_from_ore");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_brackets_range_uidx" ON "tax_table_brackets" USING btree ("year","day_type","table_number","income_from_ore","income_to_ore");