ALTER TABLE "users" ALTER COLUMN "monthly_salary_goal" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_subscription_id" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_subscription_status" varchar(64);