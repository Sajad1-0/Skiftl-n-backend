import { AppError } from '../middleware/error.middleware.js';
import { loadTaxBrackets } from './tax/load-brackets.js';
import { estimateShiftNetOre } from './tax/estimate-shift-net.js';
import { stockholmYearMonth } from './tax/month-bounds.js';
import { getTaxSettings } from '../modules/tax-settings/tax-settings.service.js';
import type { TaxColumn } from './tax/types.js';
import type { PublicShift } from '../modules/shifts/shifts.service.js';
import type { EstimateShiftNetArgs } from './tax/estimate-shift-net.js';

function asTaxColumn(n: number): TaxColumn {
  if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5 || n === 6) return n;
  throw new AppError(400, 'Ogiltig skattekolumn');
}

export async function attachEstimateNets(
  userId: string,
  publics: PublicShift[],
  taxRateByProfileId: Map<string, number>,
): Promise<PublicShift[]> {
  if (publics.length === 0) return publics;

  const settings = await getTaxSettings(userId);

  let tableCtx: EstimateShiftNetArgs['table'] | undefined;

  if (settings) {
    const brackets = await loadTaxBrackets(settings.taxYear, settings.tableNumber);
    if (brackets.length > 0) {
      tableCtx = {
        brackets,
        year: settings.taxYear,
        tableNumber: settings.tableNumber,
        column: asTaxColumn(settings.columnNumber),
        dayType: settings.dayType === '30%' ? '30%' : '30B',
      };
    }
  }

  // Kronologisk ordning för ackumulering
  const chrono = [...publics].sort(
    (a, b) => a.startAt.getTime() - b.startAt.getTime() || a.id.localeCompare(b.id),
  );

  const netById = new Map<string, number | null>();
  const runningByMonth = new Map<string, number>();

  for (const shift of chrono) {
    const { year, month } = stockholmYearMonth(shift.startAt);
    const key = `${year}-${month}`;
    const before = runningByMonth.get(key) ?? 0;
    const flat = taxRateByProfileId.get(shift.jobProfileId);

    const estimated = estimateShiftNetOre({
      shiftGrossOre: shift.grossOre,
      grossBeforeOre: before,
      ...(tableCtx ? { table: tableCtx } : {}),
      ...(!tableCtx && flat !== undefined ? { flatTaxRatePercent: flat } : {}),
    });

    netById.set(shift.id, estimated);
    runningByMonth.set(key, before + shift.grossOre);
  }

  return publics.map((s) => ({
    ...s,
    estimatedNetOre: netById.get(s.id) ?? null,
  }));
}
