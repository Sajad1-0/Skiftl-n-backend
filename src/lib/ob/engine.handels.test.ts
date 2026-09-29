import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { calculateObPay } from './engine.js';
import { HANDELS_OB_RULES } from './handels-detaljhandel.js';

/** Local Stockholm wall time with known offset for the fixture date. */
function atStockholm(
  date: string,
  hour: number,
  minute: number,
  offset: '+01:00' | '+02:00',
): Date {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return new Date(`${date}T${hh}:${mm}:00${offset}`);
}

const WAGE = 10_000; // 100 kr/h → 10000/60 öre per minut

function pay(
  start: Date,
  end: Date,
  opts?: { breakMinutes?: number; holidays?: string[]; afton?: string[] },
) {
  return calculateObPay({
    startAt: start,
    endAt: end,
    breakMinutes: opts?.breakMinutes ?? 0,
    hourlyWagesOre: WAGE,
    rules: HANDELS_OB_RULES,
    holidays: new Set(opts?.holidays ?? []),
    dayBeforeHoliday: new Set(opts?.afton ?? []),
  });
}

describe('Handels § 8.1 OB rules', () => {
  const mon = '2026-03-16'; // måndag, CET

  it('mån 18:00–18:15 → 0 % OB', () => {
    const result = pay(atStockholm(mon, 18, 0, '+01:00'), atStockholm(mon, 18, 15, '+01:00'));
    assert.equal(result.workedMinutes, 15);
    assert.equal(result.obOre, 0);
  });

  it('mån 18:15–19:00 → 50 % OB', () => {
    const result = pay(atStockholm(mon, 18, 15, '+01:00'), atStockholm(mon, 19, 0, '+01:00'));
    assert.equal(result.workedMinutes, 45);
    assert.equal(result.baseOre, Math.round(45 * (WAGE / 60)));
    assert.equal(result.obOre, Math.round(45 * (WAGE / 60) * 0.5));
  });

  it('mån 20:00–22:00 → 70 % OB', () => {
    const result = pay(atStockholm(mon, 20, 0, '+01:00'), atStockholm(mon, 22, 0, '+01:00'));
    assert.equal(result.workedMinutes, 120);
    assert.equal(result.obOre, Math.round(120 * (WAGE / 60) * 0.7));
  });

  it('tis 00:00–06:00 → 0 % OB (vardag stannar vid midnatt)', () => {
    const result = pay(
      atStockholm('2026-03-17', 0, 0, '+01:00'),
      atStockholm('2026-03-17', 6, 0, '+01:00'),
    );
    assert.equal(result.workedMinutes, 360);
    assert.equal(result.obOre, 0);
  });

  it('lör 11:00–13:00 → OB bara efter 12.00', () => {
    const result = pay(
      atStockholm('2026-03-14', 11, 0, '+01:00'),
      atStockholm('2026-03-14', 13, 0, '+01:00'),
    );
    assert.equal(result.workedMinutes, 120);
    assert.equal(result.obOre, Math.round(60 * (WAGE / 60) * 1.0));
  });

  it('julafton 13:00–15:00 → 100 % OB', () => {
    const result = pay(
      atStockholm('2026-12-24', 13, 0, '+01:00'),
      atStockholm('2026-12-24', 15, 0, '+01:00'),
      { afton: ['2026-12-24'] },
    );
    assert.equal(result.workedMinutes, 120);
    assert.equal(result.obOre, Math.round(120 * (WAGE / 60) * 1.0));
  });

  it('trettondagsafton 13:00–15:00 → 0 % OB (ej afton i § 8.1)', () => {
    // 2026-01-05 = måndag; utan afton-flagga = vanlig vardag före 18.15
    const result = pay(
      atStockholm('2026-01-05', 13, 0, '+01:00'),
      atStockholm('2026-01-05', 15, 0, '+01:00'),
      { afton: [] },
    );
    assert.equal(result.workedMinutes, 120);
    assert.equal(result.obOre, 0);
  });

  it('helgdag → 100 % OB', () => {
    const result = pay(
      atStockholm('2026-01-01', 10, 0, '+01:00'),
      atStockholm('2026-01-01', 12, 0, '+01:00'),
      { holidays: ['2026-01-01'] },
    );
    assert.equal(result.obOre, Math.round(120 * (WAGE / 60) * 1.0));
  });
});
