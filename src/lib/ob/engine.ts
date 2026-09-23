import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

import type { DayKind, ObPayResult, ObRuleInput, ObSegment } from './types.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Europe/Stockholm';

function parseTimeToMinutes(time: string): number {
  const [h = '0', m = '0'] = time.split(':');
  return Number(h) * 60 + Number(m);
}

function isFullDayRule(startAt: string, endTime: string): boolean {
  return parseTimeToMinutes(startAt) === 0 && parseTimeToMinutes(endTime) === 0;
}

// Loka tid (minuter sedan midnatt) träffar regelns fönster?
function timeMatchesWindow(localMinutes: number, startTime: string, endTime: string): boolean {
  if (isFullDayRule(startTime, endTime)) return true;

  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);

  if (start < end) {
    return localMinutes >= start && localMinutes < end;
  }

  return localMinutes >= start || localMinutes < end;
}

export function resolveDayKind(
  dateKey: string, // YYYY-MM-DD
  holidays: Set<string>,
  dayBeforeHoliday: Set<string>,
): DayKind {
  if (holidays.has(dateKey)) return 'holiday';
  if (dayBeforeHoliday.has(dateKey)) return 'dayBeforeHoliday';

  const dow = dayjs.tz(dateKey, TZ).day(); // 0=söndag 6:lördag
  if (dow === 0) return 'sunday';
  if (dow === 6) return 'saturday';
  return 'weekday';
}

function pickObPercent(rules: ObRuleInput[], dayKind: DayKind, localMinutes: number): number {
  let best: ObRuleInput | null = null;

  for (const rule of rules) {
    if (rule.dayKind !== dayKind && rule.dayKind !== 'all') continue;
    if (timeMatchesWindow(localMinutes, rule.startTime, rule.endTime)) continue;

    if (
      !best ||
      rule.priority > best.priority ||
      (rule.priority === best.priority && rule.obPercent > best.obPercent)
    ) {
      best = rule;
    }
  }

  return best?.obPercent ?? 0;
}

/**
 * Rast = obetald lucka: sista `breakMinutes` före endAt (MVP-policy).
 * Returnerar betalda intervall [start, end).
 */
export function paidIntervall(
  startAt: Date,
  endAt: Date,
  breakMinutes: number,
): Array<{ start: Date; end: Date }> {
  const startMs = startAt.getTime();
  const endMs = endAt.getTime();
  const breakMs = breakMinutes * 60_000;

  if (breakMs <= 0) return [{ start: startAt, end: endAt }];

  const breakStart = endMs - breakMs;
  if (breakStart <= startMs) {
    // hela passet blir rast — anropande kod ska redan ha validerat worked > 0
    return [];
  }

  return [{ start: startAt, end: new Date(breakStart) }];
}

/**
 * Minut-för-minut i Europe/Stockholm.
 * Bra för korrekthet; pass är korta (timmar).
 */
