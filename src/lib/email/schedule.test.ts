import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  formatBetaEndsLabel,
  paywallReminderScheduledAt,
  premiumBetaScheduledAt,
  RESEND_MAX_SCHEDULE_MS,
} from './schedule.js';

describe('premiumBetaScheduledAt', () => {
  it('schemalägger ca 2 dagar framåt', () => {
    const now = new Date('2026-11-25T10:00:00.000Z');
    const at = premiumBetaScheduledAt(now);
    assert.ok(at);
    assert.equal(at.getTime() - now.getTime(), 2 * 24 * 60 * 60 * 1000);
  });
});

describe('paywallReminderScheduledAt', () => {
  it('returnerar 7 dagar före beta-slut', () => {
    const now = new Date('2026-11-25T10:00:00.000Z');
    const betaEnds = new Date('2026-12-15T22:59:59.000Z');
    const at = paywallReminderScheduledAt(betaEnds, now);
    assert.ok(at);
    assert.equal(at.toISOString(), '2026-12-08T22:59:59.000Z');
  });

  it('skippar om påminnelsen redan passerat', () => {
    const now = new Date('2026-12-10T10:00:00.000Z');
    const betaEnds = new Date('2026-12-15T22:59:59.000Z');
    assert.equal(paywallReminderScheduledAt(betaEnds, now), null);
  });

  it('skippar om mer än Resends max-fönster', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const betaEnds = new Date(now.getTime() + RESEND_MAX_SCHEDULE_MS + 20 * 24 * 60 * 60 * 1000);
    assert.equal(paywallReminderScheduledAt(betaEnds, now), null);
  });
});

describe('formatBetaEndsLabel', () => {
  it('formaterar svenskt datum', () => {
    const label = formatBetaEndsLabel(new Date('2026-12-15T22:59:59.000Z'));
    assert.match(label, /15/);
    assert.match(label, /2026/);
  });
});
