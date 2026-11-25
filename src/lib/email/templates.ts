export interface WelcomeEmailInput {
  firstName: string;
  appUrl: string;
}

export interface PremiumBetaEmailInput {
  firstName: string;
  appUrl: string;
  betaEndsLabel: string;
}

export interface PaywallReminderEmailInput {
  firstName: string;
  appUrl: string;
  betaEndsLabel: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function welcomeEmailSubject(): string {
  return 'Välkommen till Shiftkit';
}

export function welcomeEmailHtml(input: WelcomeEmailInput): string {
  const name = escapeHtml(input.firstName);
  const url = escapeHtml(input.appUrl);

  return `
<!DOCTYPE html>
<html lang="sv">
  <body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111; max-width: 560px; margin: 0 auto; padding: 24px;">
    <p>Hej ${name},</p>
    <p>Välkommen till <strong>Shiftkit</strong> — din plats för skift, OB och lön.</p>
    <p>Kom igång så här:</p>
    <ol>
      <li>Skapa en jobbprofil (timlön och arbetsgivare)</li>
      <li>Logga ditt första pass</li>
      <li>Se månadssammanfattningen på dashboarden</li>
    </ol>
    <p><a href="${url}/dashboard" style="color: #2563eb;">Öppna Shiftkit</a></p>
    <p style="color: #666; font-size: 14px;">Lycka till,<br />Shiftkit</p>
  </body>
</html>`.trim();
}

export function premiumBetaEmailSubject(): string {
  return 'Premium är öppet under betan';
}

export function premiumBetaEmailHtml(input: PremiumBetaEmailInput): string {
  const name = escapeHtml(input.firstName);
  const url = escapeHtml(input.appUrl);
  const ends = escapeHtml(input.betaEndsLabel);

  return `
<!DOCTYPE html>
<html lang="sv">
  <body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111; max-width: 560px; margin: 0 auto; padding: 24px;">
    <p>Hej ${name},</p>
    <p>Under soft launch har du tillgång till <strong>Premium</strong> utan kostnad — till och med <strong>${ends}</strong>.</p>
    <p>Prova gärna:</p>
    <ul>
      <li>Flera jobbprofiler</li>
      <li>Bulk-loggning (lägg till flera pass samtidigt) av skift</li>
      <li>Exakta raster, sjukfrånvaro och PDF</li>
    </ul>
    <p><a href="${url}/premium" style="color: #2563eb;">Se Premium</a></p>
    <p style="color: #666; font-size: 14px;">Vi hör av oss innan betan tar slut.<br />Shiftkit</p>
  </body>
</html>`.trim();
}

export function paywallReminderEmailSubject(): string {
  return 'Premium-betan tar snart slut';
}

export function paywallReminderEmailHtml(input: PaywallReminderEmailInput): string {
  const name = escapeHtml(input.firstName);
  const url = escapeHtml(input.appUrl);
  const ends = escapeHtml(input.betaEndsLabel);

  return `
<!DOCTYPE html>
<html lang="sv">
  <body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111; max-width: 560px; margin: 0 auto; padding: 24px;">
    <p>Hej ${name},</p>
    <p>Premium-betan i Shiftkit tar slut <strong>${ends}</strong>.</p>
    <p>Efter det behåller du gratisplanen. Vill du fortsätta med Premium (historik, flera profiler, bulk-logg m.m.) kan du uppgradera när som helst.</p>
    <p><a href="${url}/premium" style="color: #2563eb;">Hantera Premium</a></p>
    <p style="color: #666; font-size: 14px;">Tack för att du testar Shiftkit.<br />Shiftkit</p>
  </body>
</html>`.trim();
}
