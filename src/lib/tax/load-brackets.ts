import { and, eq } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { taxTableBrackets } from '../../db/schema.js';
import type { TaxBracket, TaxDayType } from './types.js';

function toBracket(row: typeof taxTableBrackets.$inferSelect): TaxBracket {
  return {
    year: row.year,
    dayType: row.dayType as TaxDayType,
    tableNumber: row.tableNumber,
    incomeFromOre: row.incomeFromOre,
    incomeToOre: row.incomeToOre,
    taxIsPercent: row.taxIsPercent,
    taxCol1: row.taxCol1,
    taxCol2: row.taxCol2,
    taxCol3: row.taxCol3,
    taxCol4: row.taxCol4,
    taxCol5: row.taxCol5,
    taxCol6: row.taxCol6,
  };
}

/**
 * Ladda alla brackets för year + tableNumber (både 30B och 30%).
 * Lookup väljer dayType internt.
 */
export async function loadTaxBrackets(year: number, tableNumber: number): Promise<TaxBracket[]> {
  const rows = await db
    .select()
    .from(taxTableBrackets)
    .where(and(eq(taxTableBrackets.year, year), eq(taxTableBrackets.tableNumber, tableNumber)));

  return rows.map(toBracket);
}
