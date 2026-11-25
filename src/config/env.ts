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
  /**
   * ISO-8601 med offset, t.ex. 2026-12-15T23:59:59+01:00.
   * Tom / saknas = ingen Premium-beta.
   */
  PREMIUM_BETA_ENDS_AT: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().datetime({ offset: true }).optional(),
  ),
  /** Tom / saknas = mejl skickas inte (register fungerar ändå). */
  RESEND_API_KEY: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  /**
   * Avsändare, t.ex. `Shiftkit <hej@dindomän.se>`.
   * Utan egen domän: `Shiftkit <onboarding@resend.dev>` (bara till ditt Resend-konto).
   */
  EMAIL_FROM: z.string().default('Shiftkit <onboarding@resend.dev>'),
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
