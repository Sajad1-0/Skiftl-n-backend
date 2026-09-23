import { and, desc, eq, gte, lte } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { jobProfiles, shifts, type JobProfile, type Shift } from '../../db/schema.js';
import { calculateObPay } from '../../lib/ob/engine.js';
import { loadObPayContext } from '../../lib/ob/context.js';
import { calcWorkedMinutes } from '../../lib/shift-pay.js';
import { AppError } from '../../middleware/error.middleware.js';
import type { CreateShiftInput, ListShiftsQuery, UpdateShiftInput } from './shifts.schema.js';

interface PublicShift {
  id: string;
  userId: string;
  jobProfileId: string;
  startAt: Date;
  endAt: Date;
  breakMinutes: number;
  notes: string | null;
  createdAt: Date;
  workedMinutes: number;
  baseOre: number;
  obOre: number;
  grossOre: number;
  agreementVersionId: string | null;
}

interface ShiftPay {
  workedMinutes: number;
  baseOre: number;
  obOre: number;
  grossOre: number;
  agreementVersionId: string | null;
}

function inclusiveEndBound(date: Date): Date {
  const isMidnightUtc =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;

  if (!isMidnightUtc) {
    return date;
  }

  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

async function computeShiftPay(
  profile: JobProfile,
  startAt: Date,
  endAt: Date,
  breakMinutes: number,
): Promise<ShiftPay> {
  const workedMinutes = calcWorkedMinutes(startAt, endAt, breakMinutes);

  if (!profile.collectiveAgreementId) {
    const baseOre = Math.round((workedMinutes / 60) * profile.hourlyWage);
    return {
      workedMinutes,
      baseOre,
      obOre: 0,
      grossOre: baseOre,
      agreementVersionId: null,
    };
  }

  const ctx = await loadObPayContext(profile.collectiveAgreementId, startAt);
  if (!ctx) {
    const baseOre = Math.round((workedMinutes / 60) * profile.hourlyWage);
    return {
      workedMinutes,
      baseOre,
      obOre: 0,
      grossOre: baseOre,
      agreementVersionId: null,
    };
  }

  const pay = calculateObPay({
    startAt,
    endAt,
    breakMinutes,
    hourlyWagesOre: profile.hourlyWage,
    rules: ctx.rules,
    holidays: ctx.holiday,
    dayBeforeHoliday: ctx.dayBeforeHolidays,
  });

  return {
    workedMinutes: pay.workedMinutes,
    baseOre: pay.baseOre,
    obOre: pay.obOre,
    grossOre: pay.grossOre,
    agreementVersionId: ctx.agreementVersionId,
  };
}

function toPublicShift(shift: Shift, pay?: ShiftPay, hourlyWageOre?: number): PublicShift {
  const workedMinutes =
    pay?.workedMinutes ?? calcWorkedMinutes(shift.startAt, shift.endAt, shift.breakMinutes);

  let baseOre = shift.baseOre ?? pay?.baseOre ?? null;
  let obOre = shift.obOre ?? pay?.obOre ?? null;

  // Gamla rader utan snapshot: räkna enkel grundlön (utan OB) som fallback
  if (baseOre === null && hourlyWageOre !== undefined) {
    baseOre = Math.round((workedMinutes / 60) * hourlyWageOre);
    obOre = 0;
  }

  const safeBase = baseOre ?? 0;
  const safeOb = obOre ?? 0;
  const grossOre = pay?.grossOre ?? safeBase + safeOb;

  return {
    id: shift.id,
    userId: shift.userId,
    jobProfileId: shift.jobProfileId,
    startAt: shift.startAt,
    endAt: shift.endAt,
    breakMinutes: shift.breakMinutes,
    notes: shift.notes ?? null,
    createdAt: shift.createdAt,
    workedMinutes,
    baseOre: safeBase,
    obOre: safeOb,
    grossOre,
    agreementVersionId: shift.agreementVersionId ?? pay?.agreementVersionId ?? null,
  };
}

async function getOwnedJobProfile(userId: string, jobProfileId: string) {
  const matched = await db
    .select()
    .from(jobProfiles)
    .where(eq(jobProfiles.id, jobProfileId))
    .limit(1);
  const profile = matched[0];

  if (!profile || profile.userId !== userId) {
    throw new AppError(404, 'Jobbprofilen hittades inte');
  }

  return profile;
}

async function getOwnedShift(userId: string, shiftId: string): Promise<Shift> {
  const matched = await db.select().from(shifts).where(eq(shifts.id, shiftId)).limit(1);
  const shift = matched[0];

  if (!shift || shift.userId !== userId) {
    throw new AppError(404, 'Passet hittades inte');
  }

  return shift;
}

export async function createShift(userId: string, input: CreateShiftInput): Promise<PublicShift> {
  const profile = await getOwnedJobProfile(userId, input.jobProfileId);
  const pay = await computeShiftPay(profile, input.startAt, input.endAt, input.breakMinutes);

  const inserted = await db
    .insert(shifts)
    .values({
      userId,
      jobProfileId: input.jobProfileId,
      startAt: input.startAt,
      endAt: input.endAt,
      breakMinutes: input.breakMinutes,
      notes: input.notes ?? null,
      agreementVersionId: pay.agreementVersionId,
      baseOre: pay.baseOre,
      obOre: pay.obOre,
    })
    .returning();

  const created = inserted[0];
  if (!created) throw new AppError(500, 'Kunde inte skapa passet');

  return toPublicShift(created, pay);
}

export async function listShifts(userId: string, query: ListShiftsQuery): Promise<PublicShift[]> {
  const conditions = [eq(shifts.userId, userId), eq(jobProfiles.userId, userId)];

  if (query.from) conditions.push(gte(shifts.endAt, query.from));
  if (query.to) conditions.push(lte(shifts.startAt, inclusiveEndBound(query.to)));

  const rows = await db
    .select({
      shift: shifts,
      hourlyWage: jobProfiles.hourlyWage,
    })
    .from(shifts)
    .innerJoin(jobProfiles, eq(shifts.jobProfileId, jobProfiles.id))
    .where(and(...conditions))
    .orderBy(desc(shifts.startAt));

  return rows.map((row) => toPublicShift(row.shift, undefined, row.hourlyWage));
}

export async function getShiftById(userId: string, shiftId: string): Promise<PublicShift> {
  const shift = await getOwnedShift(userId, shiftId);
  const profile = await getOwnedJobProfile(userId, shift.jobProfileId);

  return toPublicShift(shift, undefined, profile.hourlyWage);
}

export async function updateShift(
  userId: string,
  shiftId: string,
  input: UpdateShiftInput,
): Promise<PublicShift> {
  const existing = await getOwnedShift(userId, shiftId);

  if (Object.keys(input).length === 0) {
    throw new AppError(400, 'Ingen uppdateringsdata skickades');
  }

  const nextJobProfileId = input.jobProfileId ?? existing.jobProfileId;
  const profile = await getOwnedJobProfile(userId, nextJobProfileId);

  const nextStart = input.startAt ?? existing.startAt;
  const nextEnd = input.endAt ?? existing.endAt;
  const nextBreak = input.breakMinutes ?? existing.breakMinutes;

  if (nextEnd.getTime() <= nextStart.getTime()) {
    throw new AppError(400, 'endAt måste vara efter startAt');
  }

  if (nextEnd.getTime() - nextStart.getTime() > 24 * 60 * 60 * 1000) {
    throw new AppError(400, 'Passet får vara högst 24 timmar');
  }

  const pay = await computeShiftPay(profile, nextStart, nextEnd, nextBreak);

  const updated = await db
    .update(shifts)
    .set({
      ...(input.jobProfileId !== undefined ? { jobProfileId: input.jobProfileId } : {}),
      ...(input.startAt !== undefined ? { startAt: input.startAt } : {}),
      ...(input.endAt !== undefined ? { endAt: input.endAt } : {}),
      ...(input.breakMinutes !== undefined ? { breakMinutes: input.breakMinutes } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      agreementVersionId: pay.agreementVersionId,
      baseOre: pay.baseOre,
      obOre: pay.obOre,
    })
    .where(and(eq(shifts.id, shiftId), eq(shifts.userId, userId)))
    .returning();

  const shift = updated[0];
  if (!shift) throw new AppError(404, 'Passet hittades inte');

  return toPublicShift(shift, pay);
}

export async function deleteShift(userId: string, shiftId: string): Promise<void> {
  await getOwnedShift(userId, shiftId);

  await db.delete(shifts).where(and(eq(shifts.id, shiftId), eq(shifts.userId, userId)));
}
