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
  baseOre: number;
  obOre: number;
  grossOre: number;
  netOre: number;
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
  netOre: number;
  goalOre: number | null;
  // Progress mot nettomål (0-100). 0 om inget mål.
  goalProgressPercent: number;
  byJobProfile: ProfileBreakdown[];
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

  // Gamla rader före OB-engine
  const baseOre = calcGrossOre(workedMinutes, hourlyWage);
  return { workedMinutes, baseOre, obOre: 0, grossOre: baseOre };
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
    eq(jobProfiles.userId, userId),
    gte(shifts.endAt, from),
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

  const userRows = await db
    .select({ monthlySalaryGoal: users.monthlySalaryGoal })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const goalOre = userRows[0]?.monthlySalaryGoal ?? null;

  const byProfile = new Map<string, ProfileBreakdown>();

  let workedMinutes = 0;
  let breakMinutes = 0;
  let baseOre = 0;
  let obOre = 0;
  let grossOre = 0;
  let netOre = 0;

  for (const row of rows) {
    const tax = parseTaxRate(row.taxRate);
    const pay = shiftPaySnapshot(
      row.shift.startAt,
      row.shift.endAt,
      row.shift.breakMinutes,
      row.hourlyWage,
      row.shift.baseOre ?? null,
      row.shift.obOre ?? null,
    );
    const net = calcNetOre(pay.grossOre, tax);

    workedMinutes += pay.workedMinutes;
    breakMinutes += row.shift.breakMinutes;
    baseOre += pay.baseOre;
    obOre += pay.obOre;
    grossOre += pay.grossOre;
    netOre += net;

    const existing = byProfile.get(row.profileId);
    if (existing) {
      existing.shiftCount += 1;
      existing.workedMinutes += pay.workedMinutes;
      existing.breakMinutes += row.shift.breakMinutes;
      existing.baseOre += pay.baseOre;
      existing.obOre += pay.obOre;
      existing.grossOre += pay.grossOre;
      existing.netOre += net;
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
        netOre: net,
      });
    }
  }

  const goalProgressPercent =
    goalOre && goalOre > 0 ? Math.min(100, Math.round((netOre / goalOre) * 100)) : 0;

  return {
    from,
    to,
    shiftCount: rows.length,
    workedMinutes,
    breakMinutes,
    baseOre,
    obOre,
    grossOre,
    netOre,
    goalOre,
    goalProgressPercent,
    byJobProfile: [...byProfile.values()].sort((a, b) => a.name.localeCompare(b.name, 'sv')),
  };
}
