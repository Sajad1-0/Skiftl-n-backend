import { eq } from 'drizzle-orm';

import { env, premiumBypassEmails } from '../../config/env.js';
import { db } from '../../db/index.js';
import { users, type User } from '../../db/schema.js';
import { AppError } from '../../middleware/error.middleware.js';

export type PremiumSource = 'stripe' | 'bypass' | 'beta' | 'none';

export interface PremiumAccess {
  isPremium: boolean;
  source: PremiumSource;
  /** ISO-8601 slutdatum om beta just nu ger Premium; annars null. */
  betaEndsAt: string | null;
}

export function emailHasPremiumBypass(email: string): boolean {
  return premiumBypassEmails().includes(email.trim().toLowerCase());
}

/** Parsad beta-deadline från env, eller null om avstängd. */
export function getPremiumBetaEndsAt(): Date | null {
  const raw = env.PREMIUM_BETA_ENDS_AT;
  if (!raw) return null;
  const endsAt = new Date(raw);
  if (Number.isNaN(endsAt.getTime())) return null;
  return endsAt;
}

export function isPremiumBetaActive(now: Date = new Date()): boolean {
  const endsAt = getPremiumBetaEndsAt();
  if (!endsAt) return false;
  return now.getTime() < endsAt.getTime();
}

/**
 * Ren beräkning (lätt att testa): prioritet Stripe → bypass → beta → none.
 * `betaEndsAt` och `now` injiceras så tester inte behöver mutera env/klocka globalt.
 */
export function resolvePremiumAccessFor(
  user: Pick<User, 'email' | 'isPremium'>,
  betaEndsAt: Date | null,
  now: Date,
): PremiumAccess {
  if (user.isPremium) {
    return { isPremium: true, source: 'stripe', betaEndsAt: null };
  }

  if (emailHasPremiumBypass(user.email)) {
    return { isPremium: true, source: 'bypass', betaEndsAt: null };
  }

  if (betaEndsAt && now.getTime() < betaEndsAt.getTime()) {
    return {
      isPremium: true,
      source: 'beta',
      betaEndsAt: betaEndsAt.toISOString(),
    };
  }

  return { isPremium: false, source: 'none', betaEndsAt: null };
}

/**
 * En enda sanning för Premium-access i runtime.
 * Prioritet: Stripe (DB `is_premium`) → bypass-mejl → tidsbegränsad beta → none.
 */
export function resolvePremiumAccess(
  user: Pick<User, 'email' | 'isPremium'>,
  now: Date = new Date(),
): PremiumAccess {
  return resolvePremiumAccessFor(user, getPremiumBetaEndsAt(), now);
}

/** Effektiv Premium: Stripe, bypass ELLER aktiv beta. */
export function effectiveIsPremium(
  user: Pick<User, 'email' | 'isPremium'>,
  now: Date = new Date(),
): boolean {
  return resolvePremiumAccess(user, now).isPremium;
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
