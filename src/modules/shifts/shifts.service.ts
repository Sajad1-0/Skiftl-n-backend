import { and, desc, eq, gte, lte } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { jobProfiles, shifts, type Shift } from '../../db/schema.js';
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
  grossOre: number;
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

function calcWorkMinutes(startAt: Date, endAt: Date, breakMinutes: number): number {
  const total = Math.floor((endAt.getTime() - startAt.getTime()) / 60_000);
  const worked = total - breakMinutes;

  if (worked <= 0) {
    throw new AppError(400, 'Rast får inte vara lika lång eller längre än passet');
  }

  return worked;
}

function toPublicShift(shift: Shift, hourlyWageOre: number): PublicShift {
  const workedMinutes = calcWorkMinutes(shift.startAt, shift.endAt, shift.breakMinutes);
  const grossOre = Math.round((workedMinutes / 60) * hourlyWageOre);

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
    grossOre,
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

  // Validera rast mot längd (kastar AppError om ogiltigt)
  calcWorkMinutes(input.startAt, input.endAt, input.breakMinutes);

  const inserted = await db
    .insert(shifts)
    .values({
      userId,
      jobProfileId: input.jobProfileId,
      startAt: input.startAt,
      endAt: input.endAt,
      breakMinutes: input.breakMinutes,
      notes: input.notes ?? null,
    })
    .returning();

  const created = inserted[0];
  if (!created) throw new AppError(500, 'Kunde inte skapa passet');

  return toPublicShift(created, profile.hourlyWage);
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

  return rows.map((row) => toPublicShift(row.shift, row.hourlyWage));
}

export async function getShiftById(userId: string, shiftId: string): Promise<PublicShift> {
  const shift = await getOwnedShift(userId, shiftId);
  const profile = await getOwnedJobProfile(userId, shift.jobProfileId);

  return toPublicShift(shift, profile.hourlyWage);
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

  calcWorkMinutes(nextStart, nextEnd, nextBreak);

  const updated = await db
    .update(shifts)
    .set({
      ...(input.jobProfileId !== undefined ? { jobProfileId: input.jobProfileId } : {}),
      ...(input.startAt !== undefined ? { startAt: input.startAt } : {}),
      ...(input.endAt !== undefined ? { endAt: input.endAt } : {}),
      ...(input.breakMinutes !== undefined ? { breakMinutes: input.breakMinutes } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    })
    .where(and(eq(shifts.id, shiftId), eq(shifts.userId, userId)))
    .returning();

  const shift = updated[0];
  if (!shift) throw new AppError(404, 'Passet hittades inte');

  return toPublicShift(shift, profile.hourlyWage);
}

export async function deleteShift(userId: string, shiftId: string): Promise<void> {
  await getOwnedShift(userId, shiftId);

  await db.delete(shifts).where(and(eq(shifts.id, shiftId), eq(shifts.userId, userId)));
}
