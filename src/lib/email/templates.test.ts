import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { paywallReminderEmailHtml, premiumBetaEmailHtml, welcomeEmailHtml } from './templates.js';

describe('email templates', () => {
  it('escapear HTML i välkomstmejlet', () => {
    const html = welcomeEmailHtml({
      firstName: '<script>x</script>',
      appUrl: 'https://example.com',
    });
    assert.equal(html.includes('<script>'), false);
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('https://example.com/dashboard'));
  });

  it('inkluderar beta-datum i Premium-mejlen', () => {
    const html = premiumBetaEmailHtml({
      firstName: 'Sara',
      appUrl: 'https://app.example',
      betaEndsLabel: '15 december 2026',
    });
    assert.ok(html.includes('Sara'));
    assert.ok(html.includes('15 december 2026'));
    assert.ok(html.includes('https://app.example/premium'));
  });

  it('inkluderar CTA i paywall-påminnelsen', () => {
    const html = paywallReminderEmailHtml({
      firstName: 'Alex',
      appUrl: 'https://app.example',
      betaEndsLabel: '15 december 2026',
    });
    assert.ok(html.includes('Alex'));
    assert.ok(html.includes('/premium'));
  });
});
