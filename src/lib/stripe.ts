import Stripe from 'stripe';

import { env } from '../config/env.js';
import { AppError } from '../middleware/error.middleware.js';

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new AppError(503, 'Stripe är inte konfigurerat (STRIPTE_SECRET_KEY saknas');
  }
  if (!stripeClient) {
    return (stripeClient = new Stripe(env.STRIPE_SECRET_KEY));
  }

  return stripeClient;
}

export function requireStripePriceId(): string {
  if (!env.STRIPE_PRICE_ID) {
    throw new AppError(503, 'Stripe är inte konfigurerat (STRIPE_PRICE_ID saknas');
  }

  return env.STRIPE_PRICE_ID;
}

export function requireStripeWebhookSecret(): string {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new AppError(503, 'Stripe är inte konfigurerat (STRIPE_WEBHOOK_SECRET saknas');
  }

  return env.STRIPE_WEBHOOK_SECRET;
}
