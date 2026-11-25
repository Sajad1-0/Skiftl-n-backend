import { Resend } from 'resend';

import { env } from '../../config/env.js';
import { getPremiumBetaEndsAt } from '../premium/premium.js';
import {
  formatBetaEndsLabel,
  paywallReminderScheduledAt,
  premiumBetaScheduledAt,
} from './schedule.js';
import {
  paywallReminderEmailHtml,
  paywallReminderEmailSubject,
  premiumBetaEmailHtml,
  premiumBetaEmailSubject,
  welcomeEmailHtml,
  welcomeEmailSubject,
} from './templates.js';

export interface OnboardingEmailRecipient {
  email: string;
  firstName: string;
}

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!resendClient) {
    resendClient = new Resend(env.RESEND_API_KEY);
  }
  return resendClient;
}

async function sendOrSchedule(params: {
  to: string;
  subject: string;
  html: string;
  scheduledAt?: Date;
}): Promise<void> {
  const client = getResend();
  if (!client) {
    console.info('[email] skipped (RESEND_API_KEY saknas)', {
      to: params.to,
      subject: params.subject,
    });
    return;
  }

  const { error } = await client.emails.send({
    from: env.EMAIL_FROM,
    to: params.to,
    subject: params.subject,
    html: params.html,
    ...(params.scheduledAt ? { scheduledAt: params.scheduledAt.toISOString() } : {}),
  });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Välkomstmejl direkt + schemalägger Premium-beta och paywall-påminnelse.
 * Anropa fire-and-forget från register så auth aldrig blockeras.
 */
export async function sendOnboardingEmails(
  recipient: OnboardingEmailRecipient,
  now: Date = new Date(),
): Promise<void> {
  const appUrl = env.FRONTEND_URL.replace(/\/$/, '');
  const firstName = recipient.firstName.trim() || 'där';

  await sendOrSchedule({
    to: recipient.email,
    subject: welcomeEmailSubject(),
    html: welcomeEmailHtml({ firstName, appUrl }),
  });

  const betaEndsAt = getPremiumBetaEndsAt();
  if (!betaEndsAt || betaEndsAt.getTime() <= now.getTime()) {
    return;
  }

  const betaEndsLabel = formatBetaEndsLabel(betaEndsAt);
  const betaAt = premiumBetaScheduledAt(now);
  if (betaAt) {
    await sendOrSchedule({
      to: recipient.email,
      subject: premiumBetaEmailSubject(),
      html: premiumBetaEmailHtml({ firstName, appUrl, betaEndsLabel }),
      scheduledAt: betaAt,
    });
  }

  const reminderAt = paywallReminderScheduledAt(betaEndsAt, now);
  if (reminderAt) {
    await sendOrSchedule({
      to: recipient.email,
      subject: paywallReminderEmailSubject(),
      html: paywallReminderEmailHtml({ firstName, appUrl, betaEndsLabel }),
      scheduledAt: reminderAt,
    });
  }
}

/** Fire-and-forget: loggar fel, kastar aldrig till anroparen. */
export function enqueueOnboardingEmails(recipient: OnboardingEmailRecipient): void {
  sendOnboardingEmails(recipient).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[email] onboarding failed', {
      email: recipient.email,
      message,
    });
  });
}
