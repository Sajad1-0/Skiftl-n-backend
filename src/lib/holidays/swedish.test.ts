import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { easterSunday, handelsAftonDays, swedishPublicHolidays } from './swedish.js';

describe('swedish holidays', () => {
  it('påskdagen 2025 = 20 april', () => {
    assert.equal(easterSunday(2025).toISOString().slice(0, 10), '2025-04-20');
  });

  it('påskdagen 2026 = 5 april', () => {
    assert.equal(easterSunday(2026).toISOString().slice(0, 10), '2026-04-05');
  });

  it('2026 innehåller långfredag 3 april och midsommardagen 20 juni', () => {
    const days = swedishPublicHolidays(2026);
    const dates = new Set(days.map((d) => d.date));
    assert.ok(dates.has('2026-04-03'));
    assert.ok(dates.has('2026-06-20'));
    assert.ok(dates.has('2026-10-31')); // alla helgon 2026
  });

  it('Handels-aftnar 2026 = midsommar 19 juni + jul/nyår', () => {
    const aftons = handelsAftonDays(2026);
    const dates = aftons.map((d) => d.date).sort();
    assert.deepEqual(dates, ['2026-06-19', '2026-12-24', '2026-12-31']);
  });
  it('trettondagsafton är inte Handels-afton', () => {
    const aftons = handelsAftonDays(2026);
    assert.ok(!aftons.some((d) => d.date === '2026-01-05'));
  });
});
