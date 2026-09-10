import { z } from 'zod';

export const createJobProfileSchema = z.object({
  name: z.string().trim().min(2).max(100),
  hourlyWage: z.number().int().positive(), //Öre
  taxRate: z
    .number()
    .min(0)
    .max(100)
    .transform((value) => value.toFixed(2)),
  employerName: z.string().trim().min(2).max(200).optional(),
  isPrimary: z.boolean().optional(),
});

export const updateJobProfileSchema = createJobProfileSchema.partial();

export const jobProfileIdSchema = z.object({
  id: z.uuid(),
});

export type CreateJobProfileInput = z.infer<typeof createJobProfileSchema>;
export type UpdateJobProfileInput = z.infer<typeof updateJobProfileSchema>;
