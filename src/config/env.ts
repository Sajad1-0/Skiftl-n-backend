import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET måste vara minst 32 token'),
  JWT_EXPIRES_IN_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 7),
  FRONTEND_URL: z.url().default('http://localhost:3000'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ID: z.string().optional(),
  PREMIUM_BYPASS_EMAILS: z.string().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Ogiltiga miljövariabler: ', z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export function premiumBypassEmails(): string[] {
  return env.PREMIUM_BYPASS_EMAILS.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}
