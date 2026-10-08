CREATE TABLE "user_tax_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"tax_year" smallint NOT NULL,
	"table_number" smallint NOT NULL,
	"column_number" smallint DEFAULT 1 NOT NULL,
	"day_type" varchar(8) DEFAULT '30B' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_tax_settings" ADD CONSTRAINT "user_tax_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;