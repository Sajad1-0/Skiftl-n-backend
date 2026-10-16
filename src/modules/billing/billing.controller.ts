import type { Request, Response, NextFunction } from 'express';
import type Stripe from 'stripe';

import { AppError } from '../../middleware/error.middleware.js';
import { getStripe, requireStripeWebhookSecret } from '../../lib/stripe.js';
import {
  createBillingPortalUrl,
  createCheckoutSessionUrl,
  handleStripeWebhookEvent,
} from './billing.service.js';

function requiredUser(req: Request): string {
  if (!req.user) throw new AppError(401, 'Inte autentiserad');
  return req.user.userId;
}

export async function createCheckoutController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requiredUser(req);
    const data = await createCheckoutSessionUrl(userId);

    res.status(200).json({
      success: true,
      message: 'Checkout-session skapad',
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function createPortalController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requiredUser(req);
    const data = await createBillingPortalUrl(userId);

    res.status(200).json({
      success: true,
      message: 'Billing portal skapad',
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function stripeWebhookController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const signature = req.headers['stripe-signature'];
    if (!signature || typeof signature !== 'string') {
      next(new AppError(400, 'Saknar stripe-Signature'));
      return;
    }

    const stripe = getStripe();
    const secret = requireStripeWebhookSecret();

    // req.body måste vara Buffer (express.raw) - inte parsed JSON
    const event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      signature,
      secret,
    ) as Stripe.Event;

    await handleStripeWebhookEvent(event);

    res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
}
