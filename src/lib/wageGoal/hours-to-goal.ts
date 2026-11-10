import { and, eq, isNull } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { jobProfiles } from '../../db/schema.js';
import { calcNetOre, parseTaxRate } from '../shift-pay.js';

export interface HoursToGoalResult {
  goalRemainingOre: number | null;
  hoursToGoalEstimate: number | null;
  estimatedNetOrePerHour: number | null;
}

export function estimateHoursToGoal(input: {
  goalOre: number | null;
  netOre: number;
  rateNetOre: number;
  rateWorkedMinutes: number;
  fallbackNetOrePerHour: number | null;
}): HoursToGoalResult {
  const goalOre = input.goalOre;

  if (goalOre === null || goalOre <= 0) {
    return {
      goalRemainingOre: null,
      hoursToGoalEstimate: null,
      estimatedNetOrePerHour: null,
    };
  }

  const remaining = Math.max(0, goalOre - input.netOre);

  if (remaining === 0) {
    return {
      goalRemainingOre: 0,
      hoursToGoalEstimate: 0,
      estimatedNetOrePerHour: null,
    };
  }

  const workedHours = input.rateWorkedMinutes / 60;
  let netPerHour: number | null = null;

  if (workedHours > 0 && input.rateNetOre > 0) {
    netPerHour = input.rateNetOre / workedHours;
  } else if (input.fallbackNetOrePerHour != null && input.fallbackNetOrePerHour > 0) {
    netPerHour = input.fallbackNetOrePerHour;
  }

  if (netPerHour == null || netPerHour <= 0) {
    return {
      goalRemainingOre: remaining,
      hoursToGoalEstimate: null,
      estimatedNetOrePerHour: null,
    };
  }

  // Minst 0.1 h när det finns kvarvarande belopp (undvik "0 h kvar").
  const rawHours = remaining / netPerHour;
  const hours = Math.max(0.1, Math.round(rawHours * 10) / 10);

  return {
    goalRemainingOre: remaining,
    hoursToGoalEstimate: hours,
    estimatedNetOrePerHour: Math.round(netPerHour),
  };
}

/** Schablonnetto/timme från aktiv primary-profil (eller första aktiva). */
export async function fallbackNetOrePerHourFromProfiles(userId: string): Promise<number | null> {
  const rows = await db
    .select({
      hourlyWage: jobProfiles.hourlyWage,
      taxRate: jobProfiles.taxRate,
      isPrimary: jobProfiles.isPrimary,
    })
    .from(jobProfiles)
    .where(and(eq(jobProfiles.userId, userId), isNull(jobProfiles.archivedAt)));

  if (rows.length === 0) return null;

  const primary = rows.find((r) => r.isPrimary) ?? rows[0];
  if (!primary) return null;

  const tax = parseTaxRate(primary.taxRate);

  // 1h brutto = hourlyWage öre -> netto via schablon
  return calcNetOre(primary.hourlyWage, tax);
}
