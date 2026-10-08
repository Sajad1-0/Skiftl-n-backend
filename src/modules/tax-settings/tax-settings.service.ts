import { eq } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { userTaxSettings } from '../../db/schema.js';
import { AppError } from '../../middleware/error.middleware.js';
import type { UpsertTaxSettingsInput } from './tax-settings.schema.js';

export interface PublicTaxSettings {
  taxYear: number;
  tableNumber: number;
  columnNumber: number;
  dayType: string;
  updatedAt: Date;
}

function toPublic(row: typeof userTaxSettings.$inferSelect): PublicTaxSettings {
  return {
    taxYear: row.taxYear,
    tableNumber: row.tableNumber,
    columnNumber: row.columnNumber,
    dayType: row.dayType,
    updatedAt: row.updatedAt,
  };
}

export async function getTaxSettings(userId: string): Promise<PublicTaxSettings | null> {
  const rows = await db
    .select()
    .from(userTaxSettings)
    .where(eq(userTaxSettings.userId, userId))
    .limit(1);

  const row = rows[0];
  return row ? toPublic(row) : null;
}

export async function upsertTaxSettings(
  userId: string,
  input: UpsertTaxSettingsInput,
): Promise<PublicTaxSettings> {
  const rows = await db
    .insert(userTaxSettings)
    .values({
      userId,
      taxYear: input.taxYear,
      tableNumber: input.tableNumber,
      columnNumber: input.columnNumber,
      dayType: input.dayType,
    })
    .onConflictDoUpdate({
      target: userTaxSettings.userId,
      set: {
        taxYear: input.taxYear,
        tableNumber: input.tableNumber,
        columnNumber: input.columnNumber,
        dayType: input.dayType,
        updatedAt: new Date(),
      },
    })
    .returning();

  const row = rows[0];
  if (!row) throw new AppError(500, 'Kunde inte spara skatteinställningar');
  return toPublic(row);
}
