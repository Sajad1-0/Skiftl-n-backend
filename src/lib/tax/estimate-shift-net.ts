import { calcNetOre } from '../shift-pay.js';
import { estimatedShiftNetOre } from './marginal.js';
import type { TaxBracket, TaxColumn, TaxDayType } from './types.js';

export interface EstimateShiftNetArgs {
  shiftGrossOre: number;
  grossBeforeOre: number;
  table?: {
    brackets: TaxBracket[];
    year: number;
    tableNumber: number;
    column: TaxColumn;
    dayType?: TaxDayType;
  };
  flatTaxRatePercent?: number;
}

// Null om varken tabell eller schablon kan användas
export function estimateShiftNetOre(args: EstimateShiftNetArgs): number | null {
  if (args.shiftGrossOre < 0 || args.grossBeforeOre < 0) return null;

  if (args.table) {
    const { estimatedNetOre } = estimatedShiftNetOre({
      brackets: args.table.brackets,
      year: args.table.year,
      tableNumber: args.table.tableNumber,
      column: args.table.column,
      dayType: args.table.dayType,
      grossBeforeOre: args.grossBeforeOre,
      shiftGrossOre: args.shiftGrossOre,
    });
    return estimatedNetOre;
  }

  if (args.flatTaxRatePercent !== undefined) {
    return calcNetOre(args.shiftGrossOre, args.flatTaxRatePercent);
  }

  return null;
}
