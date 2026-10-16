ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_customer_id" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "monthly_salary_goal" SET DATA TYPE integer USING (
  CASE
    WHEN "monthly_salary_goal" IS NULL THEN NULL
    WHEN "monthly_salary_goal"::text ~ '^[0-9]+$' THEN "monthly_salary_goal"::text::integer
    ELSE NULL
  END
);
