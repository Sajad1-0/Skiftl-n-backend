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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Ogiltiga miljövariabler: ', z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
