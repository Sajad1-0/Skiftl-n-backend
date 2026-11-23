ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "accepted_terms_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "terms_version" varchar(32);
