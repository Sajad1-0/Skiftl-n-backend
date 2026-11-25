/** Resend tillåter schemaläggning upp till 30 dagar framåt. */
export const RESEND_MAX_SCHEDULE_MS = 30 * 24 * 60 * 60 * 1000;

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * När Premium-beta-mejlet ska gå (ca 2 dagar efter registrering).
 * Returnerar null om det ligger utanför Resends schemafönster.
 */
export function premiumBetaScheduledAt(now: Date = new Date()): Date | null {
  const at = new Date(now.getTime() + TWO_DAYS_MS);
  if (at.getTime() - now.getTime() > RESEND_MAX_SCHEDULE_MS) return null;
  return at;
}

/**
 * Påminnelse ~7 dagar före beta-slut.
 * Skippas om tiden redan passerat eller ligger mer än 30 dagar fram.
 */
export function paywallReminderScheduledAt(betaEndsAt: Date, now: Date = new Date()): Date | null {
  const at = new Date(betaEndsAt.getTime() - SEVEN_DAYS_MS);
  if (at.getTime() <= now.getTime()) return null;
  if (at.getTime() - now.getTime() > RESEND_MAX_SCHEDULE_MS) return null;
  return at;
}

/** Svensk datumetikett för mejl (Europe/Stockholm). */
export function formatBetaEndsLabel(betaEndsAt: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    dateStyle: 'long',
  }).format(betaEndsAt);
}
