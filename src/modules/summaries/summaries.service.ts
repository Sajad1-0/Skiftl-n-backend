import { eq, and, gte, lte } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { jobProfiles, users, shifts } from '../../db/schema.js';
import {
  calcGrossOre,
  calcNetOre,
  calcWorkedMinutes,
  inclusiveEndBound,
  parseTaxRate,
} from '../../lib/shift-pay.js';
import { AppError } from '../../middleware/error.middleware.js';
import type { MonthlySummaryQuery } from './summaries.schema.js';

export interface ProfileBreakdown {
  jobProfileId: string;
  name: string;
  taxRate: number;
  shiftCount: number;
  workedMinutes: number;
  breakMinutes: number;
  grossOre: number;
  netOre: number;
}

export interface MonthlySummary {
  from: Date;
  to: Date;
  shiftCount: number;
  workedMinutes: number;
  breakMinutes: number;
  grossOre: number;
  netOre: number;
  goalOre: number | null;
  // Progress mot nettomål (0-100). 0 om inget mål.
  goalProgressPercent: number;
  byJobProfile: ProfileBreakdown[];
}

export async function getMonthlySummary(
  userId: string,
  query: MonthlySummaryQuery,
): Promise<MonthlySummary> {
  const from = query.from;
  const to = inclusiveEndBound(query.to);

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
    eq(jobProfiles.id, userId),
    gte(shifts.endAt, from),
    lte(shifts.startAt, to),
  ];

  if (query.jobProfileId) {
    conditions.push(eq(jobProfiles.id, query.jobProfileId));
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

  const userRows = await db
    .select({ monthlySalaryGoal: users.monthlySalaryGoal })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const goalOre = userRows[0]?.monthlySalaryGoal ?? null;

  const byProfile = new Map<string, ProfileBreakdown>();

  let workedMinutes = 0;
  let breakMinutes = 0;
  let grossOre = 0;
  let netOre = 0;

  for (const row of rows) {
    const minutes = calcWorkedMinutes(row.shift.startAt, row.shift.endAt, row.shift.breakMinutes);
    const tax = parseTaxRate(row.taxRate);
    const gross = calcGrossOre(minutes, row.hourlyWage);
    const net = calcNetOre(gross, tax);

    workedMinutes += minutes;
    breakMinutes += row.shift.breakMinutes;
    grossOre += gross;
    netOre += net;

    const existing = byProfile.get(row.profileId);
    if (existing) {
      existing.shiftCount += 1;
      existing.workedMinutes += minutes;
      existing.breakMinutes += row.shift.breakMinutes;
      existing.grossOre += gross;
      existing.netOre += net;
    } else {
      byProfile.set(row.profileId, {
        jobProfileId: row.profileId,
        name: row.profileName,
        taxRate: tax,
        shiftCount: 1,
        workedMinutes: minutes,
        breakMinutes: row.shift.breakMinutes,
        grossOre: gross,
        netOre: net,
      });
    }
  }

  const goalProgressPercent =
    goalOre && goalOre > 0 ? Math.min(100, Math.round(netOre / goalOre) * 100) : 0;

  return {
    from,
    to,
    shiftCount: rows.length,
    workedMinutes,
    breakMinutes,
    grossOre,
    netOre,
    goalOre,
    goalProgressPercent,
    byJobProfile: [...byProfile.values()].sort((a, b) => a.name.localeCompare(b.name, 'sv')),
  };
}
