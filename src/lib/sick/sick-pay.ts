import { stockholmYearMonth } from '../tax/month-bounds.js';

export const SICK_PAY_RATE = 0.8; // 80%

export interface SickDayBreakdown {
  date: string;
  isKarensdag: boolean;
  workedMinutes: number;
  sickPayOre: number;
}

export interface SickPeriodCalc {
  periodId: string;
  jobProfileId: string;
  startDate: string;
  endDate: string;
  karensdag: string | null;
  days: SickDayBreakdown[];
  totalSickPayOre: number;
  totalWorkedMinutes: number;
}

function stockholmDateKey(d: Date): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(d); // YYYY-MM-DD
}

function dateInInclusiveRange(day: string, start: string, end: string): boolean {
  return day >= start && day <= end;
}

/**
 * Gruppera pass per Stockholm-dag inom perioden; första dagen = karens (0 kr);
 * övriga = 80% × timlön × arbetade timmar den dagen.
 */
export function calculateSickPayForPeriod(input: {
  periodId: string;
  jobProfileId: string;
  startDate: string;
  endDate: string;
  hourlyWageOre: number;
  shifts: Array<{ startAt: Date; workedMinutes: number }>;
}): SickPeriodCalc {
  const byDay = new Map<string, number>();

  for (const s of input.shifts) {
    const day = stockholmDateKey(s.startAt);
    if (!dateInInclusiveRange(day, input.startDate, input.endDate)) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + s.workedMinutes);
  }

  const daysSorted = [...byDay.keys()].sort();
  const karensdag = daysSorted[0] ?? null;
  const days: SickDayBreakdown[] = [];

  let totalSickPayOre = 0;
  let totalWorkedMinutes = 0;

  for (const date of daysSorted) {
    const workedMinutes = byDay.get(date) ?? 0;
    totalWorkedMinutes += workedMinutes;
    const isKarensdag = date === karensdag;
    const fullOre = Math.round((workedMinutes / 60) * input.hourlyWageOre);
    const sickPayOre = isKarensdag ? 0 : Math.round(fullOre * SICK_PAY_RATE);
    totalSickPayOre += sickPayOre;
    days.push({ date, isKarensdag, workedMinutes, sickPayOre });
  }

  return {
    periodId: input.periodId,
    jobProfileId: input.jobProfileId,
    startDate: input.startDate,
    endDate: input.endDate,
    karensdag,
    days,
    totalSickPayOre,
    totalWorkedMinutes,
  };
}

/** Pass som ska exkluderas från vanlig brutto (samma profil + dag i någon sjukperiod). */
export function isShiftOnSickWorkday(
  shiftStartDate: Date,
  jobProfileId: string,
  periods: Array<{ jobProfileId: string; startDate: string; endDate: string }>,
): boolean {
  const day = stockholmDateKey(shiftStartDate);
  return periods.some(
    (p) => p.jobProfileId === jobProfileId && dateInInclusiveRange(day, p.startDate, p.endDate),
  );
}

export { stockholmDateKey, dateInInclusiveRange };
