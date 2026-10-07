import { taxForGrossFromBrackets } from './lookup.js';
import type { TaxBracket, TaxColumn, TaxDayType } from './types.js';

export interface MarginalNetInput {
  brackets: TaxBracket[];
  year: number;
  tableNumber: number;
  column: TaxColumn;
  /** Ackumulerat månadsbrutto FÖRE detta pass (öre) */
  grossBeforeOre: number;
  /** Detta pass brutto (öre) */
  shiftGrossOre: number;
  dayType?: TaxDayType;
}

/**
 * Estimerat pass-netto via tabelldelta (inte snapshot).
 * net ≈ Δgross − (tax(G+Δ) − tax(G))
 */
export function estimatedShiftNetOre(input: MarginalNetInput): {
  taxBeforeOre: number;
  taxAfterOre: number;
  taxDeltaOre: number;
  estimatedNetOre: number;
} {
  const base = {
    brackets: input.brackets,
    year: input.year,
    tableNumber: input.tableNumber,
    column: input.column,
    dayType: input.dayType,
  };

  const before = taxForGrossFromBrackets(input.brackets, {
    ...base,
    grossOre: input.grossBeforeOre,
  });

  const after = taxForGrossFromBrackets(input.brackets, {
    ...base,
    grossOre: input.grossBeforeOre + input.shiftGrossOre,
  });

  const taxDeltaOre = after.taxOre - before.taxOre;
  const estimatedNetOre = input.shiftGrossOre - taxDeltaOre;

  return {
    taxBeforeOre: before.taxOre,
    taxAfterOre: after.taxOre,
    taxDeltaOre,
    estimatedNetOre,
  };
}
