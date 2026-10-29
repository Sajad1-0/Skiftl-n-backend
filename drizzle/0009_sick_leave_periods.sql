CREATE TABLE IF NOT EXISTS "sick_leave_periods" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "job_profile_id" uuid NOT NULL REFERENCES "job_profile_id"("id") ON DELETE cascade,
    "start_date" date NOT NULL,
    "end_date" date NOT NULL,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "sick_leave_user_id_idx" ON "sick_leave_periods" ("user_id");
CREATE INDEX IF NOT EXISTS "sick_leave_user_start_idx" ON "sick_leave_periods" ("user_id", "start_date");