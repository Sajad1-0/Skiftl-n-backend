/**
 * Handels Detaljhandelsavtal § 8.1 (1 apr 2025 – 31 mar 2027).
 * Källa: Svensk Handel / Handelsanställdas förbund.
 * Approximation för app-beräkning — ingen juridisk rådgivning.
 */

import type { ObRuleInput } from './types.js';

export const HANDELS_AGREEMENT_CODE = 'handels_retail';

export const HANDELS_AGREEMENT_NAME = 'Handels detaljhandel (butik)';

export const HANDELS_AGREEMENT_DESCRIPTION =
  'OB enligt Detaljhandelsavtalet § 8.1 (Svensk Handel / Handels), ' +
  '1 apr 2025–31 mar 2027. Approximation för butik/kontor/lager i butik. ' +
  'Inte juridisk rådgivning.';

export const HANDELS_VERSION_LABEL = '2025–2027';

/** Inclusive start: 2025-04-01 00:00 Europe/Stockholm */
export const HANDELS_EFFECTIVE_FROM = new Date('2025-03-31T22:00:00.000Z');

/** Inclusive end: 2027-03-31 23:59:59.999 Europe/Stockholm */
export const HANDELS_EFFECTIVE_TO = new Date('2027-03-31T21:59:59.999Z');

/** OB-regler för seed och tester (endTime 00:00 med start > 0 = till midnatt). */
export const HANDELS_OB_RULES: ObRuleInput[] = [
  {
    dayKind: 'weekday',
    startTime: '18:15:00',
    endTime: '20:00:00',
    obPercent: 50,
    priority: 10,
    label: 'Vardag 18.15–20.00',
  },
  {
    dayKind: 'weekday',
    startTime: '20:00:00',
    endTime: '00:00:00',
    obPercent: 70,
    priority: 10,
    label: 'Vardag efter 20.00',
  },
  {
    dayKind: 'saturday',
    startTime: '12:00:00',
    endTime: '00:00:00',
    obPercent: 100,
    priority: 20,
    label: 'Lördag efter 12.00',
  },
  {
    dayKind: 'dayBeforeHoliday',
    startTime: '12:00:00',
    endTime: '00:00:00',
    obPercent: 100,
    priority: 20,
    label: 'Jul-/nyårs-/midsommarafton efter 12.00',
  },
  {
    dayKind: 'sunday',
    startTime: '00:00:00',
    endTime: '00:00:00',
    obPercent: 100,
    priority: 20,
    label: 'Söndag',
  },
  {
    dayKind: 'holiday',
    startTime: '00:00:00',
    endTime: '00:00:00',
    obPercent: 100,
    priority: 20,
    label: 'Helgdag',
  },
];

export const HANDELS_AFTON_DATES: Array<{ date: string; name: string }> = [
  { date: '2025-06-20', name: 'Midsommarafton' },
  { date: '2025-12-24', name: 'Julafton' },
  { date: '2025-12-31', name: 'Nyårsafton' },
  { date: '2026-06-19', name: 'Midsommarafton' },
  { date: '2026-12-24', name: 'Julafton' },
  { date: '2026-12-31', name: 'Nyårsafton' },
];
