import { and, desc, eq, gte, isNotNull, lte } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { jobProfiles, shifts, type JobProfile, type Shift } from '../../db/schema.js';
import { calculateObPay } from '../../lib/ob/engine.js';
import { loadObPayContext } from '../../lib/ob/context.js';
import { calcWorkedMinutes, parseTaxRate } from '../../lib/shift-pay.js';
import { AppError } from '../../middleware/error.middleware.js';
import type {
  BulkCreateShiftsInput,
  CreateShiftInput,
  ListShiftsQuery,
  UpdateShiftInput,
} from './shifts.schema.js';
import { attachEstimateNets, resolveTableCtx } from '../../lib/shift-estimate-nets.js';
import {
  isWithinRecentStockholmMonths,
  sameStockholmMonth,
  stockholmMonthQueryRange,
  stockholmYearMonth,
} from '../../lib/tax/month-bounds.js';
import { estimateShiftNetOre } from '../../lib/tax/estimate-shift-net.js';
import {
  assertFreeCanAccessShiftStart,
  resolveHistoryRange,
  resolveShiftBreaks,
} from '../../lib/premium/premium-guards.js';
import {
  getActiveOwnedJobProfile,
  getOwnedJobProfile,
} from '../job-profiles/job-profiles.service.js';
import {
  parsedStoredBreakIntervals,
  toStoredBreakIntervals,
  type BreakInterval,
  type StoredBreakIntervals,
} from '../../lib/breaks.js';
import { userHasPremium } from '../../lib/premium/premium.js';
export interface PublicShift {
  id: string;
  userId: string;
  jobProfileId: string;
  startAt: Date;
  endAt: Date;
  breakMinutes: number;
  breakIntervals: StoredBreakIntervals[] | null;
  notes: string | null;
  createdAt: Date;
  workedMinutes: number;
  baseOre: number;
  obOre: number;
  grossOre: number;
  agreementVersionId: string | null;
  estimatedNetOre: number | null;
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
  breakIntervals?: BreakInterval[] | null,
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
    breakIntervals: breakIntervals ?? null,
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
  const parsedIntervals = parsedStoredBreakIntervals(
    shift.breakIntervals as StoredBreakIntervals[] | null,
  );
  const breakIntervals =
    parsedIntervals.length > 0 ? toStoredBreakIntervals(parsedIntervals) : null;

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
    breakIntervals,
    notes: shift.notes ?? null,
    createdAt: shift.createdAt,
    workedMinutes,
    baseOre: safeBase,
    obOre: safeOb,
    grossOre,
    agreementVersionId: shift.agreementVersionId ?? pay?.agreementVersionId ?? null,
    estimatedNetOre: null,
  };
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
  await assertFreeCanAccessShiftStart(userId, input.startAt);
  const profile = await getActiveOwnedJobProfile(userId, input.jobProfileId);
  const resolved = await resolveShiftBreaks(
    userId,
    input.startAt,
    input.endAt,
    input.breakMinutes,
    input.breakIntervals,
  );
  const pay = await computeShiftPay(
    profile,
    input.startAt,
    input.endAt,
    resolved.breakMinutes,
    resolved.breakIntervals,
  );

  const inserted = await db
    .insert(shifts)
    .values({
      userId,
      jobProfileId: input.jobProfileId,
      startAt: input.startAt,
      endAt: input.endAt,
      breakMinutes: resolved.breakMinutes,
      breakIntervals: resolved.breakIntervals
        ? toStoredBreakIntervals(resolved.breakIntervals)
        : null,
      notes: input.notes ?? null,
      agreementVersionId: pay.agreementVersionId,
      baseOre: pay.baseOre,
      obOre: pay.obOre,
    })
    .returning();

  const created = inserted[0];
  if (!created) throw new AppError(500, 'Kunde inte skapa passet');

  const publicShift = toPublicShift(created, pay);
  const estimatedNetOre = await estimateNetForCreatedShift(userId, created, profile, publicShift);
  return { ...publicShift, estimatedNetOre };
}

/** Est. netto för nyss skapat pass (marginal inom Stockholm-månad). */
async function estimateNetForCreatedShift(
  userId: string,
  created: Shift,
  profile: JobProfile,
  publicShift: PublicShift,
): Promise<number | null> {
  const { from, to } = stockholmMonthQueryRange(created.startAt);
  // Join profil så legacy-rader utan snapshot får samma brutto-fallback som listShifts
  const prior = await db
    .select({
      shift: shifts,
      hourlyWage: jobProfiles.hourlyWage,
    })
    .from(shifts)
    .innerJoin(jobProfiles, eq(shifts.jobProfileId, jobProfiles.id))
    .where(
      and(
        eq(shifts.userId, userId),
        eq(jobProfiles.userId, userId),
        gte(shifts.startAt, from),
        lte(shifts.startAt, to),
      ),
    );

  let grossBefore = 0;
  for (const row of prior) {
    const p = row.shift;
    if (p.id === created.id) continue;
    if (!sameStockholmMonth(p.startAt, created.startAt)) continue;
    // Samma starttid: räkna in tidigare rader via id-ordning (stabil)
    if (
      p.startAt.getTime() > created.startAt.getTime() ||
      (p.startAt.getTime() === created.startAt.getTime() && p.id.localeCompare(created.id) >= 0)
    ) {
      continue;
    }
    const pub = toPublicShift(p, undefined, row.hourlyWage);
    grossBefore += pub.grossOre;
  }

  const tableCtx = await resolveTableCtx(userId);
  const flat = parseTaxRate(profile.taxRate);

  return estimateShiftNetOre({
    shiftGrossOre: publicShift.grossOre,
    grossBeforeOre: grossBefore,
    ...(tableCtx ? { table: tableCtx } : {}),
    ...(!tableCtx ? { flatTaxRatePercent: flat } : {}),
  });
}

export async function createBulkShifts(
  userId: string,
  input: BulkCreateShiftsInput,
): Promise<PublicShift[]> {
  if (!(await userHasPremium(userId))) {
    throw new AppError(403, 'Bulk-log kräver Premium');
  }

  const profile = await getActiveOwnedJobProfile(userId, input.jobProfileId);

  // Preflight + pay per rad (samma break-regler som createShift)
  const prepared: Array<{
    startAt: Date;
    endAt: Date;
    breakMinutes: number;
    breakIntervals: BreakInterval[] | null;
    notes: string | null;
    pay: ShiftPay;
  }> = [];

  for (const row of input.shifts) {
    await assertFreeCanAccessShiftStart(userId, row.startAt);
    const resolved = await resolveShiftBreaks(
      userId,
      row.startAt,
      row.endAt,
      row.breakMinutes,
      row.breakIntervals,
    );
    calcWorkedMinutes(row.startAt, row.endAt, resolved.breakMinutes);
    const pay = await computeShiftPay(
      profile,
      row.startAt,
      row.endAt,
      resolved.breakMinutes,
      resolved.breakIntervals,
    );
    prepared.push({
      startAt: row.startAt,
      endAt: row.endAt,
      breakMinutes: resolved.breakMinutes,
      breakIntervals: resolved.breakIntervals,
      notes: row.notes ?? null,
      pay,
    });
  }

  const inserted = await db.transaction(async (tx) => {
    const rows: Array<{ shift: Shift; pay: ShiftPay }> = [];
    for (const item of prepared) {
      const result = await tx
        .insert(shifts)
        .values({
          userId,
          jobProfileId: input.jobProfileId,
          startAt: item.startAt,
          endAt: item.endAt,
          breakMinutes: item.breakMinutes,
          breakIntervals: item.breakIntervals ? toStoredBreakIntervals(item.breakIntervals) : null,
          notes: item.notes,
          agreementVersionId: item.pay.agreementVersionId,
          baseOre: item.pay.baseOre,
          obOre: item.pay.obOre,
        })
        .returning();
      const created = result[0];
      if (!created) throw new AppError(500, 'Kunde inte skapa passen');
      rows.push({ shift: created, pay: item.pay });
    }
    return rows;
  });

  // Est. netto efter commit (läsning); misslyckande här lämnar pass kvar men inte halv batch
  const out: PublicShift[] = [];
  for (const { shift, pay } of inserted) {
    const publicShift = toPublicShift(shift, pay);
    const estimatedNetOre = await estimateNetForCreatedShift(userId, shift, profile, publicShift);
    out.push({ ...publicShift, estimatedNetOre });
  }
  return out;
}

export async function listShifts(userId: string, query: ListShiftsQuery): Promise<PublicShift[]> {
  const { from, to, isPremium } = await resolveHistoryRange(userId, query.from, query.to);
  const now = new Date();
  const conditions = [
    eq(shifts.userId, userId),
    eq(jobProfiles.userId, userId),
    gte(shifts.startAt, from),
    lte(shifts.startAt, inclusiveEndBound(to)),
  ];

  const rows = await db
    .select({
      shift: shifts,
      hourlyWage: jobProfiles.hourlyWage,
      taxRate: jobProfiles.taxRate,
    })
    .from(shifts)
    .innerJoin(jobProfiles, eq(shifts.jobProfileId, jobProfiles.id))
    .where(and(...conditions))
    .orderBy(desc(shifts.startAt));

  const taxRateByProfileId = new Map<string, number>();
  const publics = rows
    .map((row) => {
      taxRateByProfileId.set(row.shift.jobProfileId, parseTaxRate(row.taxRate));
      return toPublicShift(row.shift, undefined, row.hourlyWage);
    })
    .filter((s) => {
      const start = new Date(s.startAt);
      return isPremium ? isWithinRecentStockholmMonths(start, now) : sameStockholmMonth(start, now);
    });

  // Om from/to klippt listan: ladda hela Stockholm-månaden för korrekt G₀
  const monthContext = await loadMonthContextShifts(userId, publics, taxRateByProfileId);

  return attachEstimateNets(userId, publics, taxRateByProfileId, monthContext);
}

/** Alla pass i Stockholm-månaderna som `anchors` täcker (för korrekt marginal). */
async function loadMonthContextShifts(
  userId: string,
  anchors: PublicShift[],
  taxRateByProfileId: Map<string, number>,
): Promise<PublicShift[]> {
  if (anchors.length === 0) return [];

  const monthKeys = new Set(
    anchors.map((s) => {
      const { year, month } = stockholmYearMonth(s.startAt);
      return `${year}-${month}`;
    }),
  );

  const ranges = anchors.map((s) => stockholmMonthQueryRange(s.startAt));
  const from = new Date(Math.min(...ranges.map((r) => r.from.getTime())));
  const to = new Date(Math.max(...ranges.map((r) => r.to.getTime())));

  const rows = await db
    .select({
      shift: shifts,
      hourlyWage: jobProfiles.hourlyWage,
      taxRate: jobProfiles.taxRate,
    })
    .from(shifts)
    .innerJoin(jobProfiles, eq(shifts.jobProfileId, jobProfiles.id))
    .where(
      and(
        eq(shifts.userId, userId),
        eq(jobProfiles.userId, userId),
        gte(shifts.startAt, from),
        lte(shifts.startAt, to),
      ),
    );

  const context: PublicShift[] = [];
  for (const row of rows) {
    const { year, month } = stockholmYearMonth(row.shift.startAt);
    if (!monthKeys.has(`${year}-${month}`)) continue;
    taxRateByProfileId.set(row.shift.jobProfileId, parseTaxRate(row.taxRate));
    context.push(toPublicShift(row.shift, undefined, row.hourlyWage));
  }
  return context;
}

export async function getShiftById(userId: string, shiftId: string): Promise<PublicShift> {
  const shift = await getOwnedShift(userId, shiftId);
  await assertFreeCanAccessShiftStart(userId, shift.startAt);
  // Tillåt arkiverad profil — historiska pass ska fortfarande gå att läsa
  const profile = await getOwnedJobProfile(userId, shift.jobProfileId);

  return toPublicShift(shift, undefined, profile.hourlyWage);
}

export async function updateShift(
  userId: string,
  shiftId: string,
  input: UpdateShiftInput,
): Promise<PublicShift> {
  const existing = await getOwnedShift(userId, shiftId);
  await assertFreeCanAccessShiftStart(userId, existing.startAt);

  if (Object.keys(input).length === 0) {
    throw new AppError(400, 'Ingen uppdateringsdata skickades');
  }

  const nextJobProfileId = input.jobProfileId ?? existing.jobProfileId;
  // Byte till annan profil kräver aktiv; samma id (även arkiverad) tillåts för löne-omräkning
  const isSwitchingProfile = nextJobProfileId !== existing.jobProfileId;
  const profile = isSwitchingProfile
    ? await getActiveOwnedJobProfile(userId, nextJobProfileId)
    : await getOwnedJobProfile(userId, nextJobProfileId);

  // UpdateShiftInput har optional fält — coalesca till Date innan resolveShiftBreaks
  const nextStart = input.startAt ?? existing.startAt;
  const nextEnd = input.endAt ?? existing.endAt;
  const isPremium = await userHasPremium(userId);
  const existingIntervals = parsedStoredBreakIntervals(existing.breakIntervals);

  // Free: skicka aldrig lagrade intervall till resolveShiftBreaks (403).
  // Då rensas intervall-läge och pay räknas om med breakMinutes (end-lump OB).
  let nextIntervals: BreakInterval[] | undefined;
  if (!isPremium) {
    nextIntervals = undefined;
  } else if (input.breakIntervals !== undefined) {
    nextIntervals = input.breakIntervals;
  } else if (input.breakMinutes !== undefined) {
    nextIntervals = undefined; // explicit minuter → lämna intervall-läget
  } else if (existingIntervals.length > 0) {
    nextIntervals = existingIntervals;
  } else {
    nextIntervals = undefined;
  }

  // Free får inte flytta pass ut ur innevarande månad
  await assertFreeCanAccessShiftStart(userId, nextStart);

  if (nextEnd.getTime() <= nextStart.getTime()) {
    throw new AppError(400, 'endAt måste vara efter startAt');
  }

  if (nextEnd.getTime() - nextStart.getTime() > 24 * 60 * 60 * 1000) {
    throw new AppError(400, 'Passet får vara högst 24 timmar');
  }

  const resolved = await resolveShiftBreaks(
    userId,
    nextStart,
    nextEnd,
    input.breakMinutes ?? existing.breakMinutes,
    nextIntervals,
  );

  const pay = await computeShiftPay(
    profile,
    nextStart,
    nextEnd,
    resolved.breakMinutes,
    resolved.breakIntervals,
  );

  const updated = await db
    .update(shifts)
    .set({
      ...(input.jobProfileId !== undefined ? { jobProfileId: input.jobProfileId } : {}),
      ...(input.startAt !== undefined ? { startAt: input.startAt } : {}),
      ...(input.endAt !== undefined ? { endAt: input.endAt } : {}),
      breakMinutes: resolved.breakMinutes,
      breakIntervals: resolved.breakIntervals
        ? toStoredBreakIntervals(resolved.breakIntervals)
        : null,
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
  const existing = await getOwnedShift(userId, shiftId);
  await assertFreeCanAccessShiftStart(userId, existing.startAt);

  await db.delete(shifts).where(and(eq(shifts.id, shiftId), eq(shifts.userId, userId)));
}

/**
 * Vid Premium-downgrade: ta bort exakta intervall och räkna om pay med breakMinutes
 * (end-lump OB), så free inte behåller intervall-optimerad OB-snapshot.
 */
export async function stripExactBreaksOnDowngrade(userId: string): Promise<void> {
  const rows = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.userId, userId), isNotNull(shifts.breakIntervals)));

  for (const shift of rows) {
    const ownedProfile = await getOwnedJobProfile(userId, shift.jobProfileId);
    const pay = await computeShiftPay(
      ownedProfile,
      shift.startAt,
      shift.endAt,
      shift.breakMinutes,
      null,
    );

    await db
      .update(shifts)
      .set({
        breakIntervals: null,
        agreementVersionId: pay.agreementVersionId,
        baseOre: pay.baseOre,
        obOre: pay.obOre,
      })
      .where(and(eq(shifts.id, shift.id), eq(shifts.userId, userId)));
  }
}
