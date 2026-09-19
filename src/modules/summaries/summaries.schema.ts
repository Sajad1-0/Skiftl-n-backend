import { z } from 'zod';

export const monthlySummaryQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    jobProfileId: z.uuid().optional(),
  })
  .refine((q) => q.to.getTime() >= q.from.getTime(), {
    message: '`to` måste vara samma dag eller efter `from`',
    path: ['to'],
  });

export type MonthlySummaryQuery = z.infer<typeof monthlySummaryQuerySchema>;
