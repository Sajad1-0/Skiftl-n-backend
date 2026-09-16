import { z } from 'zod';

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
  );

export const shiftIdSchema = z.object({
  id: z.uuid(),
});

export const listShiftsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;
export type ListShiftsQuery = z.infer<typeof listShiftsQuerySchema>;
