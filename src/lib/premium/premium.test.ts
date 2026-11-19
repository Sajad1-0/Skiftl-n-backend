// src/lib/premium/premium.test.ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolvePremiumAccessFor, subscriptionStatusGrantsPremium } from './premium.js';

describe('resolvePremiumAccessFor', () => {
  const betaEndsAt = new Date('2026-12-15T22:59:59.000Z'); // 23:59:59+01:00
  const duringBeta = new Date('2026-11-19T10:00:00.000Z');
  const afterBeta = new Date('2026-12-16T00:00:00.000Z');

  it('ger stripe när DB isPremium är true (även under beta)', () => {
    const access = resolvePremiumAccessFor(
      { email: 'a@example.com', isPremium: true },
      betaEndsAt,
      duringBeta,
    );
    assert.equal(access.isPremium, true);
    assert.equal(access.source, 'stripe');
    assert.equal(access.betaEndsAt, null);
  });

  it('ger beta när deadline ligger i framtiden', () => {
    const access = resolvePremiumAccessFor(
      { email: 'a@example.com', isPremium: false },
      betaEndsAt,
      duringBeta,
    );
    assert.equal(access.isPremium, true);
    assert.equal(access.source, 'beta');
    assert.equal(access.betaEndsAt, betaEndsAt.toISOString());
  });

  it('ger none när beta har löpt ut', () => {
    const access = resolvePremiumAccessFor(
      { email: 'a@example.com', isPremium: false },
      betaEndsAt,
      afterBeta,
    );
    assert.equal(access.isPremium, false);
    assert.equal(access.source, 'none');
    assert.equal(access.betaEndsAt, null);
  });

  it('ger none när ingen beta är konfigurerad', () => {
    const access = resolvePremiumAccessFor(
      { email: 'a@example.com', isPremium: false },
      null,
      duringBeta,
    );
    assert.equal(access.isPremium, false);
    assert.equal(access.source, 'none');
  });
});

describe('subscriptionStatusGrantsPremium', () => {
  it('accepterar active och trialing', () => {
    assert.equal(subscriptionStatusGrantsPremium('active'), true);
    assert.equal(subscriptionStatusGrantsPremium('trialing'), true);
    assert.equal(subscriptionStatusGrantsPremium('canceled'), false);
  });
});
