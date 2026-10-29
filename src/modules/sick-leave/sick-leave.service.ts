import { and, eq, desc, gte, lte, sql } from 'drizzle-orm';
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

function toPublic(period: typeof sickLeavePeriods.$inferSelect, calc?: SickPeriodCalc) {
  return {
    id: period.id,
    userId: period.userId,
    jobProfileId: period.jobProfileId,
    startDate: period.startDate,
    endDate: period.endDate,
    notes: period.notes ?? null,
    createAt: period.createdAt,
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
    workedMinutes:
      s.baseOre != null
        ? calcWorkedMinutes(s.startAt, s.endAt, s.breakMinutes)
        : calcWorkedMinutes(s.startAt, s.endAt, s.breakMinutes),
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

export async function createSickLeave(userId: string, input: CreateSickLeaveInput) {
  await assertPremium(userId);
  const profile = await getOwnedJobProfile(userId, input.jobProfileId);

  // Historikfönster: periodens start måste vara inom free/premium range (använd midnatt UTC på startDate)
  const startInstant = new Date(`${input.startDate}T12:00:00+1:00`);
  await resolveHistoryRange(userId, startInstant, startInstant);

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
  const matched = await db
    .select()
    .from(sickLeavePeriods)
    .where(and(eq(sickLeavePeriods.id, id), eq(sickLeavePeriods.userId, userId)))
    .limit(1);

  const row = matched[0];
  if (!row) throw new AppError(404, 'Sjukperioden hittades inte');
  const profile = await getOwnedJobProfile(userId, row.jobProfileId);
  return toPublic(row, await calcForPeriod(row, profile.hourlyWage));
}

export async function updatedSickLeave(userId: string, id: string, input: UpdateSickLeaveInput) {
  await assertPremium(userId);
  const existing = await getSickLeaveById(userId, id);
  const nextProfileId = input.jobProfileId ?? existing.jobProfileId;
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

/** För summary: alla perioder som överlappar from/to. */
export async function loadSickPeriodsOverlapping(userId: string, from: Date, to: Date) {
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
