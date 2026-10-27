import { z } from 'zod';

const MAX_BULK_SHIFTS = 10;

/** Max passlängd (inkl. rast) — skyddar OB-motorns minutloop. */
const MAX_SHIFT_MS = 24 * 60 * 60 * 1000;

function withinMaxDuration(startAt: Date, endAt: Date): boolean {
  return endAt.getTime() - startAt.getTime() <= MAX_SHIFT_MS;
}

export const createShiftSchema = z
  .object({
    jobProfileId: z.uuid(),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    breakMinutes: z.number().int().min(0).default(0),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((data) => data.endAt.getTime() > data.startAt.getTime(), {
    message: 'endAt måste vara efter startAt',
    path: ['endAt'],
  })
  .refine((data) => withinMaxDuration(data.startAt, data.endAt), {
    message: 'Passet får vara högst 24 timmar',
    path: ['endAt'],
  });

export const updateShiftSchema = z
  .object({
    jobProfileId: z.uuid().optional(),
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
    breakMinutes: z.number().int().min(0).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.startAt && data.endAt) {
        return data.endAt.getTime() > data.startAt.getTime();
      }
      return true;
    },
    { message: 'endAt måste vara efter startAt', path: ['endAt'] },
  )
  .refine(
    (data) => {
      if (data.startAt && data.endAt) {
        return withinMaxDuration(data.startAt, data.endAt);
      }
      return true;
    },
    { message: 'Passet får vara högst 24 timmar', path: ['endAt'] },
  );

export const shiftIdSchema = z.object({
  id: z.uuid(),
});

export const listShiftsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const bulkShiftRowSchema = z
  .object({
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    breakMinutes: z.number().int().min(0).default(0),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((data) => data.endAt.getTime() > data.startAt.getTime(), {
    message: 'Slut tid måste vara efter start tid',
    path: ['endAt'],
  })
  .refine((data) => withinMaxDuration(data.startAt, data.endAt), {
    message: 'Passet får vara max 24 timmar.',
    path: ['endAt'],
  });

export const bulkCreateShiftsSchema = z.object({
  jobProfileId: z.uuid(),
  shifts: z
    .array(bulkShiftRowSchema)
    .min(1, 'Minst ett pass krävs')
    .max(MAX_BULK_SHIFTS, `Högst ${MAX_BULK_SHIFTS} pass per bulk`),
});

export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;
export type ListShiftsQuery = z.infer<typeof listShiftsQuerySchema>;
export type BulkCreateShiftsInput = z.infer<typeof bulkCreateShiftsSchema>;
