import { z } from 'zod';

export const upsertSalaryGoalSchema = z.object({
  monthlySalaryGoalOre: z.number().int().min(0).max(100_000_000).nullable(),
});

export type UpsertSalaryGoalInput = z.infer<typeof upsertSalaryGoalSchema>;
