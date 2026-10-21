import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import {
  emailHasPremiumBypass,
  subscriptionStatusGrantsPremium,
} from '../../lib/premium/premium.js';
import { getStripe, requireStripePriceId, subscriptionHasPremiumPrice } from '../../lib/stripe.js';
import { AppError } from '../../middleware/error.middleware.js';
import { forceArchiveExtrasOnDowngrade } from '../job-profiles/job-profiles.service.js';

function customerIdOf(subscription: Stripe.Subscription): string {
  return typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer.id;
}

async function getUserOrThrow(userId: string) {
  const matched = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = matched[0];
  if (!user) throw new AppError(404, 'Användaren hittades inte');
  return user;
}

async function ensureStripeCustomer(userId: string): Promise<string> {
  const user = await getUserOrThrow(userId);
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const stripe = getStripe();
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ');
  const customer = await stripe.customers.create({
    email: user.email,
    ...(displayName ? { name: displayName } : {}),
    metadata: { userId: user.id },
  });

  await db.update(users).set({ stripeCustomerId: customer.id }).where(eq(users.id, userId));

  return customer.id;
}

export async function createCheckoutSessionUrl(userId: string): Promise<{ url: string }> {
  const user = await getUserOrThrow(userId);

  if (emailHasPremiumBypass(user.email)) {
    throw new AppError(400, 'Ditt konto har redan Premium (bypass)');
  }
  if (user.isPremium && user.stripeSubscriptionId) {
    throw new AppError(400, 'Du har redan ett aktivt Premium-abonnemang');
  }

  const customerId = await ensureStripeCustomer(userId);
  const stripe = getStripe();
  const priceId = requireStripePriceId();

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${env.FRONTEND_URL}/premium?success=1`,
    cancel_url: `${env.FRONTEND_URL}/premium?canceled=1`,
    client_reference_id: userId,
    metadata: { userId },
    subscription_data: { metadata: { userId } },
  });

  if (!session.url) throw new AppError(500, 'Kunde inte skapa Stripe Checkout');

  return { url: session.url };
}

export async function createBillingPortalUrl(userId: string): Promise<{ url: string }> {
  const user = await getUserOrThrow(userId);

  if (emailHasPremiumBypass(user.email)) {
    throw new AppError(400, 'Bypass-konto behöver ingen Stripe-portal');
  }
  if (!user.stripeCustomerId) {
    throw new AppError(400, 'Inget Stripe-konto — starta en prenumeration först');
  }

  const stripe = getStripe();
  const portal = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${env.FRONTEND_URL}/premium`,
  });

  return { url: portal.url };
}

async function setPremiumFromSubscription(
  userId: string,
  subscription: Stripe.Subscription,
): Promise<void> {
  // Endast vår Premium-price får ge entitlement
  if (!subscriptionHasPremiumPrice(subscription)) {
    console.error('Stripe subscription saknar Premium-price', {
      userId,
      subscriptionId: subscription.id,
    });
    return;
  }

  const status = subscription.status;
  const isPremium = subscriptionStatusGrantsPremium(status);

  await db
    .update(users)
    .set({
      isPremium,
      stripeSubscriptionId: subscription.id,
      stripeSubscriptionStatus: status,
      stripeCustomerId: customerIdOf(subscription),
    })
    .where(eq(users.id, userId));

  if (!isPremium) {
    await forceArchiveExtrasOnDowngrade(userId);
  }
}

async function findUserIdForSubscription(
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const customerId = customerIdOf(subscription);

  const byCustomer = await db
    .select()
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1);

  const user = byCustomer[0];
  if (!user) return null;

  const metaUserId = subscription.metadata?.userId;
  if (metaUserId && metaUserId !== user.id) {
    console.error('Stripe subscription metadata.userId matchar inte customer', {
      metaUserId,
      userId: user.id,
      customerId,
    });
    return null;
  }

  return user.id;
}

export async function handleStripeWebhookEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== 'subscription') return;

      const sessionUserId = session.metadata?.userId ?? session.client_reference_id;
      if (!sessionUserId || !session.subscription) return;

      const sessionCustomerId =
        typeof session.customer === 'string' ? session.customer : (session.customer?.id ?? null);

      const user = await getUserOrThrow(sessionUserId);
      if (
        sessionCustomerId &&
        user.stripeCustomerId &&
        user.stripeCustomerId !== sessionCustomerId
      ) {
        console.error('Checkout customer matchar inte user.stripeCustomerId', {
          userId: sessionUserId,
          sessionCustomerId,
          stored: user.stripeCustomerId,
        });
        return;
      }

      const stripe = getStripe();
      const subId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
      const subscription = await stripe.subscriptions.retrieve(subId);

      // Om customer saknades i DB: spara från session innan status-update
      if (!user.stripeCustomerId && sessionCustomerId) {
        await db
          .update(users)
          .set({ stripeCustomerId: sessionCustomerId })
          .where(eq(users.id, sessionUserId));
      }

      await setPremiumFromSubscription(sessionUserId, subscription);
      return;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = await findUserIdForSubscription(subscription);
      if (!userId) return;

      if (event.type === 'customer.subscription.deleted') {
        await db
          .update(users)
          .set({
            isPremium: false,
            stripeSubscriptionStatus: 'canceled',
            stripeSubscriptionId: subscription.id,
          })
          .where(eq(users.id, userId));
        return;
      }

      await setPremiumFromSubscription(userId, subscription);
      return;
    }

    default:
      return;
  }
}
