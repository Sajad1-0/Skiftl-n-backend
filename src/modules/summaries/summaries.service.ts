import { and, eq, gte, lte } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { jobProfiles, shifts, users } from '../../db/schema.js';
import { loadTaxBrackets } from '../../lib/tax/load-brackets.js';
import { taxForGrossFromBrackets } from '../../lib/tax/lookup.js';
import type { TaxColumn } from '../../lib/tax/types.js';
import {
  calcGrossOre,
  calcNetOre,
  calcWorkedMinutes,
  inclusiveEndBound,
  parseTaxRate,
} from '../../lib/shift-pay.js';
import { AppError } from '../../middleware/error.middleware.js';
import { getTaxSettings } from '../tax-settings/tax-settings.service.js';
import type { MonthlySummaryQuery } from './summaries.schema.js';
import { userHasPremium } from '../../lib/premium/premium.js';
import { resolveHistoryRange } from '../../lib/premium/premium-guards.js';
import { isWithinRecentStockholmMonths, sameStockholmMonth } from '../../lib/tax/month-bounds.js';
import { loadSickPeriodsOverlapping } from '../sick-leave/sick-leave.service.js';
import {
  calculateSickPayForPeriod,
  isShiftOnSickWorkday,
  stockholmDateKey,
  type SickDayBreakdown,
} from '../../lib/sick/sick-pay.js';
import {
  estimateHoursToGoal,
  fallbackNetOrePerHourFromProfiles,
} from '../../lib/wageGoal/hours-to-goal.js';

export interface ProfileBreakdown {
  jobProfileId: string;
  name: string;
  taxRate: number;
  shiftCount: number;
  workedMinutes: number;
  breakMinutes: number;
  baseOre: number;
  obOre: number;
  grossOre: number;
  taxOre: number;
  netOre: number;
}

export interface SickLeaveSummaryRow {
  periodId: string;
  jobProfileId: string;
  profileName: string;
  startDate: string;
  endDate: string;
  karensdag: string | null;
  sickPayOre: number;
  days: SickDayBreakdown[];
}

export interface MonthlySummary {
  from: Date;
  to: Date;
  shiftCount: number;
  workedMinutes: number;
  breakMinutes: number;
  baseOre: number;
  obOre: number;
  grossOre: number;
  /** Skatt i öre (månadsnivå vid tabell, annars summa av flat) */
  taxOre: number;
  netOre: number;
  /** table = skattetabell; flat = jobbprofilens taxRate */
  taxMode: 'table' | 'flat';
  goalOre: number | null;
  goalProgressPercent: number;
  goalRemainingOre: number | null;
  hoursToGoalEstimate: number | null;
  estimatedNetOrePerHour: number | null;
  byJobProfile: ProfileBreakdown[];
  sickPayOre: number;
  sickLeave: SickLeaveSummaryRow[];
}

function shiftPaySnapshot(
  startAt: Date,
  endAt: Date,
  breakMinutes: number,
  hourlyWage: number,
  storedBase: number | null,
  storedOb: number | null,
): { workedMinutes: number; baseOre: number; obOre: number; grossOre: number } {
  const workedMinutes = calcWorkedMinutes(startAt, endAt, breakMinutes);

  if (storedBase != null) {
    const baseOre = storedBase;
    const obOre = storedOb ?? 0;
    return { workedMinutes, baseOre, obOre, grossOre: baseOre + obOre };
  }

  const baseOre = calcGrossOre(workedMinutes, hourlyWage);
  return { workedMinutes, baseOre, obOre: 0, grossOre: baseOre };
}

function asTaxColumn(n: number): TaxColumn {
  if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5 || n === 6) return n;
  throw new AppError(400, 'Ogiltig skattekolumn (1–6)');
}

/** Fördela månadsnetto proportionellt efter brutto (sista profilen får resten). */
function allocateNetByGross(
  profiles: ProfileBreakdown[],
  totalGrossOre: number,
  totalNetOre: number,
): void {
  if (profiles.length === 0) return;

  if (totalGrossOre <= 0) {
    for (const p of profiles) p.netOre = 0;
    return;
  }

  let allocated = 0;
  for (let i = 0; i < profiles.length; i++) {
    const profile = profiles[i]!;
    if (i === profiles.length - 1) {
      profile.netOre = totalNetOre - allocated;
    } else {
      profile.netOre = Math.round((profile.grossOre / totalGrossOre) * totalNetOre);
      allocated += profile.netOre;
    }
  }
}

export async function getMonthlySummary(
  userId: string,
  query: MonthlySummaryQuery,
): Promise<MonthlySummary> {
  const {
    from,
    to: toRaw,
    isPremium: rangeIsPremium,
  } = await resolveHistoryRange(userId, query.from, query.to);
  const to = inclusiveEndBound(toRaw);
  const now = new Date();

  if (query.jobProfileId) {
    const owned = await db
      .select({ id: jobProfiles.id })
      .from(jobProfiles)
      .where(and(eq(jobProfiles.id, query.jobProfileId), eq(jobProfiles.userId, userId)))
      .limit(1);

    if (!owned[0]) {
      throw new AppError(404, 'Jobbprofilen hittades inte');
    }
  }

  const conditions = [
    eq(shifts.userId, userId),
    eq(jobProfiles.userId, userId),
    gte(shifts.startAt, from),
    lte(shifts.startAt, to),
  ];

  if (query.jobProfileId) {
    conditions.push(eq(shifts.jobProfileId, query.jobProfileId));
  }

  const rows = await db
    .select({
      shift: shifts,
      profileId: jobProfiles.id,
      profileName: jobProfiles.name,
      hourlyWage: jobProfiles.hourlyWage,
      taxRate: jobProfiles.taxRate,
    })
    .from(shifts)
    .innerJoin(jobProfiles, eq(shifts.jobProfileId, jobProfiles.id))
    .where(and(...conditions));

  const premium = await userHasPremium(userId);

  const userRows = premium
    ? await db
        .select({ monthlySalaryGoal: users.monthlySalaryGoal })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    : [];

  // Lönemål är Premium — free får null. Filtrerad summary (jobProfileId) hoppar över mål
  // så progress/timmar inte blandas med ett helmånadsmål.
  const goalOre =
    premium && !query.jobProfileId ? (userRows[0]?.monthlySalaryGoal ?? null) : null;


  const sickRows =
    premium && rangeIsPremium ? await loadSickPeriodsOverlapping(userId, from, to) : [];

  const sickPeriodMeta = sickRows.map((r) => ({
    jobProfileId: r.period.jobProfileId,
    startDate: r.period.startDate,
    endDate: r.period.endDate,
  }));

  const fromKey = stockholmDateKey(from);
  const toKey = stockholmDateKey(to);

  const sickLeave: SickLeaveSummaryRow[] = [];
  let sickPayOre = 0;

  for (const r of sickRows) {
    const allShifts = await db
      .select()
      .from(shifts)
      .where(and(eq(shifts.userId, userId), eq(shifts.jobProfileId, r.period.jobProfileId)));

    const calc = calculateSickPayForPeriod({
      periodId: r.period.id,
      jobProfileId: r.period.jobProfileId,
      startDate: r.period.startDate,
      endDate: r.period.endDate,
      hourlyWageOre: r.hourlyWage,
      shifts: allShifts.map((s) => ({
        startAt: s.startAt,
        workedMinutes: calcWorkedMinutes(s.startAt, s.endAt, s.breakMinutes),
      })),
    });

    const daysInMonth = calc.days.filter((d) => d.date >= fromKey && d.date <= toKey);
    const monthSickPay = daysInMonth.reduce((sum, d) => sum + d.sickPayOre, 0);
    sickPayOre += monthSickPay;

    sickLeave.push({
      periodId: r.period.id,
      jobProfileId: r.period.jobProfileId,
      profileName: r.profileName,
      startDate: r.period.startDate,
      endDate: r.period.endDate,
      karensdag: calc.karensdag,
      sickPayOre: monthSickPay,
      days: daysInMonth,
    });
  }

  const byProfile = new Map<string, ProfileBreakdown>();

  let shiftCount = 0;
  let workedMinutes = 0;
  /** Betalda arbetstimmar (exkl. sjukdagar) — används för netto/timme mot lönemål. */
  let paidWorkedMinutes = 0;
  let breakMinutes = 0;
  let baseOre = 0;
  let obOre = 0;
  let grossOre = 0;
  let flatNetOre = 0;

  for (const row of rows) {
    const startOk = rangeIsPremium
      ? isWithinRecentStockholmMonths(row.shift.startAt, now)
      : sameStockholmMonth(row.shift.startAt, now);
    if (!startOk) continue;

    const onSick = isShiftOnSickWorkday(row.shift.startAt, row.profileId, sickPeriodMeta);

    const tax = parseTaxRate(row.taxRate);
    const pay = shiftPaySnapshot(
      row.shift.startAt,
      row.shift.endAt,
      row.shift.breakMinutes,
      row.hourlyWage,
      row.shift.baseOre ?? null,
      row.shift.obOre ?? null,
    );

    shiftCount += 1;
    workedMinutes += pay.workedMinutes;
    breakMinutes += row.shift.breakMinutes;

    if (onSick) continue;

    paidWorkedMinutes += pay.workedMinutes;

    const flatNet = calcNetOre(pay.grossOre, tax);

    baseOre += pay.baseOre;
    obOre += pay.obOre;
    grossOre += pay.grossOre;
    flatNetOre += flatNet;

    const existing = byProfile.get(row.profileId);
    if (existing) {
      existing.shiftCount += 1;
      existing.workedMinutes += pay.workedMinutes;
      existing.breakMinutes += row.shift.breakMinutes;
      existing.baseOre += pay.baseOre;
      existing.obOre += pay.obOre;
      existing.grossOre += pay.grossOre;
      existing.netOre += flatNet;
      existing.taxOre += pay.grossOre - flatNet;
    } else {
      byProfile.set(row.profileId, {
        jobProfileId: row.profileId,
        name: row.profileName,
        taxRate: tax,
        shiftCount: 1,
        workedMinutes: pay.workedMinutes,
        breakMinutes: row.shift.breakMinutes,
        baseOre: pay.baseOre,
        obOre: pay.obOre,
        grossOre: pay.grossOre,
        taxOre: pay.grossOre - flatNet,
        netOre: flatNet,
      });
    }
  }

  const settings = await getTaxSettings(userId);
  grossOre += sickPayOre;
  if (sickPayOre > 0 && !(premium && settings)) {
    const avgRate =
      [...byProfile.values()].reduce((s, p) => s + p.taxRate, 0) / Math.max(1, byProfile.size) ||
      30;
    flatNetOre += calcNetOre(sickPayOre, avgRate);
  }

  let taxMode: 'table' | 'flat' = 'flat';
  let taxOre = grossOre - flatNetOre;
  let netOre = flatNetOre;
  const profiles = [...byProfile.values()].sort((a, b) => a.name.localeCompare(b.name, 'sv'));

  if (premium && settings) {
    const brackets = await loadTaxBrackets(settings.taxYear, settings.tableNumber);
    if (brackets.length === 0) {
      throw new AppError(
        400,
        'Skattetabell saknas för valt år/tabellnummer. Kör pnpm db:seed:tax-tables.',
      );
    }

    const lookup = taxForGrossFromBrackets(brackets, {
      year: settings.taxYear,
      tableNumber: settings.tableNumber,
      column: asTaxColumn(settings.columnNumber),
      grossOre,
      dayType: settings.dayType === '30%' ? '30%' : '30B',
    });

    taxMode = 'table';
    taxOre = lookup.taxOre;
    netOre = grossOre - taxOre;
    allocateNetByGross(profiles, profiles.reduce((s, p) => s + p.grossOre, 0) || 1, netOre);
    for (const profile of profiles) {
      profile.taxOre = profile.grossOre - profile.netOre;
    }
  }

  const goalProgressPercent =
    goalOre && goalOre > 0 ? Math.min(100, Math.round((netOre / goalOre) * 100)) : 0;

  // Rate-netto exkl. sjuklön så sjukdagar inte snedvrider netto/timme.
  const rateNetOre = Math.max(0, netOre - sickPayOre);

  let fallbackNetPerHour: number | null = null;
  if (goalOre != null && goalOre > 0 && (paidWorkedMinutes <= 0 || rateNetOre <= 0)) {
    fallbackNetPerHour = await fallbackNetOrePerHourFromProfiles(userId);
  }

  const hoursGoal = estimateHoursToGoal({
    goalOre,
    netOre,
    rateNetOre,
    rateWorkedMinutes: paidWorkedMinutes,
    fallbackNetOrePerHour: fallbackNetPerHour,
  });

  // Defense-in-depth: free får aldrig mål-/timfält.
  const goalFields = premium
    ? {
        goalOre,
        goalProgressPercent,
        goalRemainingOre: hoursGoal.goalRemainingOre,
        hoursToGoalEstimate: hoursGoal.hoursToGoalEstimate,
        estimatedNetOrePerHour: hoursGoal.estimatedNetOrePerHour,
      }
    : {
        goalOre: null,
        goalProgressPercent: 0,
        goalRemainingOre: null,
        hoursToGoalEstimate: null,
        estimatedNetOrePerHour: null,
      };

  return {
    from,
    to,
    shiftCount,
    workedMinutes,
    breakMinutes,
    baseOre,
    obOre,
    grossOre,
    taxOre,
    netOre,
    taxMode,
    ...goalFields,
    byJobProfile: profiles,
    sickPayOre,
    sickLeave: premium ? sickLeave : [],
  };
}
