import { z } from 'zod';

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum måste vara YYYY-MM-DD');

export const createSickLeaveSchema = z
  .object({
    jobProfileId: z.uuid(),
    startDate: ymd,
    endDate: ymd,
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: 'Slutdatumet för sjukanmälning måste vara samma dag eller efter startdatumet',
    path: ['endDate'],
  });

export const updateSickLeaveSchema = z
  .object({
    jobProfileId: z.uuid().optional(),
    startDate: ymd.optional(),
    endDate: ymd.optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine(
    (d) => {
      if (d.startDate && d.endDate) return d.endDate >= d.startDate;
      return true;
    },
    { message: 'Slutdatumet för sjukanmälning måste vara samma dag eller efter startdatumet' },
  );

export const sickLeaveIdSchema = z.object({ id: z.uuid() });

export const listSickLeaveQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type CreateSickLeaveInput = z.infer<typeof createSickLeaveSchema>;
export type UpdateSickLeaveInput = z.infer<typeof updateSickLeaveSchema>;
export type ListSickLeaveQuery = z.infer<typeof listSickLeaveQuerySchema>;
