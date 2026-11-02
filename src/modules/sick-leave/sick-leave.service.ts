import { and, eq, desc, gte, lte, ne } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { jobProfiles, shifts, sickLeavePeriods } from '../../db/schema.js';
import { AppError } from '../../middleware/error.middleware.js';
import { userHasPremium } from '../../lib/premium/premium.js';
import { resolveHistoryRange } from '../../lib/premium/premium-guards.js';
import { calcWorkedMinutes } from '../../lib/shift-pay.js';
import {
  calculateSickPayForPeriod,
  stockholmDateKey,
  type SickPeriodCalc,
} from '../../lib/sick/sick-pay.js';
import { getOwnedJobProfile } from '../job-profiles/job-profiles.service.js';
import type {
  CreateSickLeaveInput,
  ListSickLeaveQuery,
  UpdateSickLeaveInput,
} from './sick-leave-schema.js';

async function assertPremium(userId: string): Promise<void> {
  if (!(await userHasPremium(userId))) {
    throw new AppError(403, 'Sjukanmälan kräver Premium');
  }
}

/** YYYY-MM-DD → Date around noon UTC so Stockholm-månad blir stabil. */
function ymdToInstant(ymd: string): Date {
  return new Date(`${ymd}T12:00:00.000Z`);
}

async function assertSickPeriodDatesAllowed(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<void> {
  if (endDate < startDate) {
    throw new AppError(400, 'Slutdatum måste vara samma dag eller efter startdatum');
  }
  const startInstant = ymdToInstant(startDate);
  await resolveHistoryRange(userId, startInstant, startInstant);

  const todayKey = stockholmDateKey(new Date());
  if (endDate <= todayKey) {
    const endInstant = ymdToInstant(endDate);
    await resolveHistoryRange(userId, endInstant, endInstant);
  }
}

/** Avvisa överlappande perioder för samma jobbprofil (annars dubbel sjuklön i summary). */
async function assertNoOverlappingPeriod(
  userId: string,
  jobProfileId: string,
  startDate: string,
  endDate: string,
  excludeId?: string,
): Promise<void> {
  const conditions = [
    eq(sickLeavePeriods.userId, userId),
    eq(sickLeavePeriods.jobProfileId, jobProfileId),
    lte(sickLeavePeriods.startDate, endDate),
    gte(sickLeavePeriods.endDate, startDate),
  ];
  if (excludeId) {
    conditions.push(ne(sickLeavePeriods.id, excludeId));
  }

  const overlap = await db
    .select({ id: sickLeavePeriods.id })
    .from(sickLeavePeriods)
    .where(and(...conditions))
    .limit(1);

  if (overlap[0]) {
    throw new AppError(400, 'Sjukperioden överlappar en befintlig period för samma jobbprofil');
  }
}

function toPublic(period: typeof sickLeavePeriods.$inferSelect, calc?: SickPeriodCalc) {
  return {
    id: period.id,
    userId: period.userId,
    jobProfileId: period.jobProfileId,
    startDate: period.startDate,
    endDate: period.endDate,
    notes: period.notes ?? null,
    createdAt: period.createdAt,
    karensdag: calc?.karensdag ?? null,
    totalSickPayOre: calc?.totalSickPayOre ?? 0,
    totalWorkedMinutes: calc?.totalWorkedMinutes ?? 0,
    days: calc?.days ?? [],
  };
}

async function calcForPeriod(
  period: typeof sickLeavePeriods.$inferSelect,
  hourlyWageOre: number,
): Promise<SickPeriodCalc> {
  const rows = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.userId, period.userId), eq(shifts.jobProfileId, period.jobProfileId)));

  const shiftInput = rows.map((s) => ({
    startAt: s.startAt,
    workedMinutes: calcWorkedMinutes(s.startAt, s.endAt, s.breakMinutes),
  }));

  return calculateSickPayForPeriod({
    periodId: period.id,
    jobProfileId: period.jobProfileId,
    startDate: period.startDate,
    endDate: period.endDate,
    hourlyWageOre,
    shifts: shiftInput,
  });
}

async function getOwnedPeriodRow(userId: string, id: string) {
  const matched = await db
    .select()
    .from(sickLeavePeriods)
    .where(and(eq(sickLeavePeriods.id, id), eq(sickLeavePeriods.userId, userId)))
    .limit(1);
  const row = matched[0];
  if (!row) throw new AppError(404, 'Sjukperioden hittades inte');
  return row;
}

export async function createSickLeave(userId: string, input: CreateSickLeaveInput) {
  await assertPremium(userId);
  const profile = await getOwnedJobProfile(userId, input.jobProfileId);

  await assertSickPeriodDatesAllowed(userId, input.startDate, input.endDate);
  await assertNoOverlappingPeriod(userId, input.jobProfileId, input.startDate, input.endDate);

  const inserted = await db
    .insert(sickLeavePeriods)
    .values({
      userId,
      jobProfileId: input.jobProfileId,
      startDate: input.startDate,
      endDate: input.endDate,
      notes: input.notes ?? null,
    })
    .returning();

  const row = inserted[0]!;
  const calc = await calcForPeriod(row, profile.hourlyWage);
  return toPublic(row, calc);
}

export async function listSickLeave(userId: string, query: ListSickLeaveQuery) {
  await assertPremium(userId);
  const { from, to } = await resolveHistoryRange(userId, query.from, query.to);
  const fromKey = stockholmDateKey(from);
  const toKey = stockholmDateKey(to);

  const rows = await db
    .select({
      period: sickLeavePeriods,
      hourlyWage: jobProfiles.hourlyWage,
    })
    .from(sickLeavePeriods)
    .innerJoin(jobProfiles, eq(sickLeavePeriods.jobProfileId, jobProfiles.id))
    .where(
      and(
        eq(sickLeavePeriods.userId, userId),
        lte(sickLeavePeriods.startDate, toKey),
        gte(sickLeavePeriods.endDate, fromKey),
      ),
    )
    .orderBy(desc(sickLeavePeriods.startDate));

  const out = [];
  for (const r of rows) {
    const calc = await calcForPeriod(r.period, r.hourlyWage);
    out.push(toPublic(r.period, calc));
  }
  return out;
}

export async function getSickLeaveById(userId: string, id: string) {
  await assertPremium(userId);
  const row = await getOwnedPeriodRow(userId, id);
  await assertSickPeriodDatesAllowed(userId, row.startDate, row.endDate);
  const profile = await getOwnedJobProfile(userId, row.jobProfileId);
  return toPublic(row, await calcForPeriod(row, profile.hourlyWage));
}

export async function updatedSickLeave(userId: string, id: string, input: UpdateSickLeaveInput) {
  await assertPremium(userId);
  const existing = await getOwnedPeriodRow(userId, id);

  const nextStart = input.startDate ?? existing.startDate;
  const nextEnd = input.endDate ?? existing.endDate;
  const nextProfileId = input.jobProfileId ?? existing.jobProfileId;

  await assertSickPeriodDatesAllowed(userId, nextStart, nextEnd);
  await assertNoOverlappingPeriod(userId, nextProfileId, nextStart, nextEnd, id);

  const profile = await getOwnedJobProfile(userId, nextProfileId);

  const updated = await db
    .update(sickLeavePeriods)
    .set({
      ...(input.jobProfileId !== undefined ? { jobProfileId: input.jobProfileId } : {}),
      ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
      ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    })
    .where(and(eq(sickLeavePeriods.id, id), eq(sickLeavePeriods.userId, userId)))
    .returning();

  const row = updated[0];
  if (!row) throw new AppError(404, 'Sjukperioden hittades inte');
  return toPublic(row, await calcForPeriod(row, profile.hourlyWage));
}

export async function deleteSickLeave(userId: string, id: string): Promise<void> {
  await assertPremium(userId);
  const deleted = await db
    .delete(sickLeavePeriods)
    .where(and(eq(sickLeavePeriods.id, id), eq(sickLeavePeriods.userId, userId)))
    .returning({ id: sickLeavePeriods.id });

  if (!deleted[0]) throw new AppError(404, 'Sjukperioden hittades inte');
}

/** För summary: alla perioder som överlappar from/to. Premium-only. */
export async function loadSickPeriodsOverlapping(userId: string, from: Date, to: Date) {
  await assertPremium(userId);
  const fromKey = stockholmDateKey(from);
  const toKey = stockholmDateKey(to);

  return db
    .select({
      period: sickLeavePeriods,
      hourlyWage: jobProfiles.hourlyWage,
      profileName: jobProfiles.name,
    })
    .from(sickLeavePeriods)
    .innerJoin(jobProfiles, eq(sickLeavePeriods.jobProfileId, jobProfiles.id))
    .where(
      and(
        eq(sickLeavePeriods.userId, userId),
        lte(sickLeavePeriods.startDate, toKey),
        gte(sickLeavePeriods.endDate, fromKey),
      ),
    );
}
