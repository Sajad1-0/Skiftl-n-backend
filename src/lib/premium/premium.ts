import { eq } from 'drizzle-orm';

import { premiumBypassEmails } from '../../config/env.js';
import { db } from '../../db/index.js';
import { users, type User } from '../../db/schema.js';
import { AppError } from '../../middleware/error.middleware.js';

export function emailHasPremiumBypass(email: string): boolean {
  return premiumBypassEmails().includes(email.trim().toLowerCase());
}

/** Effektiv Premium: bypass-mejl ELLER is_premium i DB. */
export function effectiveIsPremium(user: Pick<User, 'email' | 'isPremium'>): boolean {
  return emailHasPremiumBypass(user.email) || user.isPremium;
}

export async function userHasPremium(userId: string): Promise<boolean> {
  const matched = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = matched[0];
  if (!user) throw new AppError(404, 'Användaren hittades inte');
  return effectiveIsPremium(user);
}

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

export function subscriptionStatusGrantsPremium(status: string | null | undefined): boolean {
  if (!status) return false;
  return ACTIVE_STATUSES.has(status);
}
