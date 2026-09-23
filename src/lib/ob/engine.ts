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
    if (!timeMatchesWindow(localMinutes, rule.startTime, rule.endTime)) continue;

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
export function calculateObPay(input: {
  startAt: Date;
  endAt: Date;
  breakMinutes: number;
  hourlyWagesOre: number;
  rules: ObRuleInput[];
  holidays: Set<string>;
  dayBeforeHoliday: Set<string>;
}): ObPayResult {
  const intervals = paidIntervall(input.startAt, input.endAt, input.breakMinutes);
  const wagePerMinute = input.hourlyWagesOre / 60;

  let workedMinutes = 0;
  let baseOreExact = 0;
  let obOreExact = 0;

  const segments: ObSegment[] = [];
  let cur: {
    start: Date;
    end: Date;
    obPercent: number;
    dayKind: DayKind;
    minutes: number;
  } | null = null;

  function flush() {
    if (!cur || cur.minutes <= 0) {
      cur = null;
      return;
    }

    const base = Math.round(cur.minutes * wagePerMinute);
    const ob = Math.round(cur.minutes * wagePerMinute * (cur.obPercent / 100));
    segments.push({
      startAt: cur.start.toISOString(),
      endAt: cur.end.toISOString(),
      minutes: cur.minutes,
      obPercent: cur.obPercent,
      dayKind: cur.dayKind,
      baseOre: base,
      obOre: ob,
    });
    cur = null;
  }

  for (const { start, end } of intervals) {
    let t = start.getTime();
    const endMs = end.getTime();

    while (t < endMs) {
      const instant = new Date(t);
      const local = dayjs(instant).tz(TZ);
      const dateKey = local.format('YYYY-MM-DD');
      const dayKind = resolveDayKind(dateKey, input.holidays, input.dayBeforeHoliday);
      const localMinutes = local.hour() * 60 + local.minute();
      const obPercent = pickObPercent(input.rules, dayKind, localMinutes);

      workedMinutes += 1;
      baseOreExact += wagePerMinute;
      obOreExact += wagePerMinute * (obPercent / 100);

      const next = t + 60_000;

      if (
        cur &&
        cur.obPercent === obPercent &&
        cur.dayKind === dayKind &&
        cur.end.getTime() === t
      ) {
        cur.end = new Date(next);
        cur.minutes += 1;
      } else {
        flush();
        cur = {
          start: instant,
          end: new Date(next),
          obPercent,
          dayKind,
          minutes: 1,
        };
      }
      t = next;
    }
  }
  flush();

  const baseOre = Math.round(baseOreExact);
  const obOre = Math.round(obOreExact);

  return {
    workedMinutes,
    baseOre,
    obOre,
    grossOre: baseOre + obOre,
    segments,
  };
}
