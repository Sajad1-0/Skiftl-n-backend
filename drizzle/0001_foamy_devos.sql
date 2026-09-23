CREATE TABLE "collective_agreement_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agreement_id" uuid NOT NULL,
	"label" varchar(100) NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collective_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collective_agreements_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "ob_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"day_kind" varchar(16) NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"ob_percent" numeric(5, 2) NOT NULL,
	"priority" smallint DEFAULT 0 NOT NULL,
	"label" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_day_before_holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_before_holiday_date" date NOT NULL,
	"name" varchar(200) NOT NULL,
	"region" varchar(64) DEFAULT 'SE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"holiday_date" date NOT NULL,
	"name" varchar(200) NOT NULL,
	"region" varchar(64) DEFAULT 'SE' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_profiles" ADD COLUMN "collective_agreement_id" uuid;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "agreement_version_id" uuid;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "base_ore" integer;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "ob_ore" integer;--> statement-breakpoint
ALTER TABLE "collective_agreement_versions" ADD CONSTRAINT "collective_agreement_versions_agreement_id_collective_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."collective_agreements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ob_rules" ADD CONSTRAINT "ob_rules_version_id_collective_agreement_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."collective_agreement_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cav_agreement_id_idx" ON "collective_agreement_versions" USING btree ("agreement_id");--> statement-breakpoint
CREATE INDEX "cav_effective_from_idx" ON "collective_agreement_versions" USING btree ("agreement_id","effective_from");--> statement-breakpoint
CREATE INDEX "ob_rules_version_id_idx" ON "ob_rules" USING btree ("version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "public_day_before_holiday_date_region_uidx" ON "public_day_before_holidays" USING btree ("day_before_holiday_date","region");--> statement-breakpoint
CREATE UNIQUE INDEX "public_holiday_date_region_uidx" ON "public_holidays" USING btree ("holiday_date","region");--> statement-breakpoint
ALTER TABLE "job_profiles" ADD CONSTRAINT "job_profiles_collective_agreement_id_collective_agreements_id_fk" FOREIGN KEY ("collective_agreement_id") REFERENCES "public"."collective_agreements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_agreement_version_id_collective_agreement_versions_id_fk" FOREIGN KEY ("agreement_version_id") REFERENCES "public"."collective_agreement_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_profiles_agreement_id_idx" ON "job_profiles" USING btree ("collective_agreement_id");