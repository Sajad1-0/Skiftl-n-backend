import { z } from 'zod';

export const upsertTaxSettingsSchema = z.object({
  taxYear: z.number().int().min(2000).max(2100),
  tableNumber: z.number().int().min(29).max(42),
  columnNumber: z.number().int().min(1).max(6).default(1),
  dayType: z.enum(['30B', '30%']).default('30B'),
});

export type UpsertTaxSettingsInput = z.infer<typeof upsertTaxSettingsSchema>;
