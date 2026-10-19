import { AppError } from '../middleware/error.middleware.js';
import { loadTaxBrackets } from './tax/load-brackets.js';
import { estimateShiftNetOre, type EstimateShiftNetArgs } from './tax/estimate-shift-net.js';
import { stockholmYearMonth } from './tax/month-bounds.js';
import { getTaxSettings } from '../modules/tax-settings/tax-settings.service.js';
import type { TaxColumn } from './tax/types.js';
import { userHasPremium } from './premium/premium.js';

export interface ShiftEstimateInput {
  id: string;
  jobProfileId: string;
  startAt: Date;
  grossOre: number;
  estimatedNetOre: number | null;
}

function asTaxColumn(n: number): TaxColumn {
  if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5 || n === 6) return n;
  throw new AppError(400, 'Ogiltig skattekolumn');
}

/** Ladda tabellkontext för user (eller undefined → flat fallback). */
export async function resolveTableCtx(
  userId: string,
): Promise<EstimateShiftNetArgs['table'] | undefined> {
  if (!(await userHasPremium(userId))) return undefined;

  const settings = await getTaxSettings(userId);
  if (!settings) return undefined;

  const brackets = await loadTaxBrackets(settings.taxYear, settings.tableNumber);
  if (brackets.length === 0) return undefined;

  return {
    brackets,
    year: settings.taxYear,
    tableNumber: settings.tableNumber,
    column: asTaxColumn(settings.columnNumber),
    dayType: settings.dayType === '30%' ? '30%' : '30B',
  };
}

/**
 * Sätt estimatedNetOre på `publics`.
 * `monthContext` ska vara alla pass i samma Stockholm-månad(er) så G₀ blir rätt
 * även när list-query filtrerats (from/to).
 */
export async function attachEstimateNets<T extends ShiftEstimateInput>(
  userId: string,
  publics: T[],
  taxRateByProfileId: Map<string, number>,
  monthContext?: ShiftEstimateInput[],
): Promise<T[]> {
  if (publics.length === 0) return publics;

  const tableCtx = await resolveTableCtx(userId);
  const context = monthContext && monthContext.length > 0 ? monthContext : publics;

  const chrono = [...context].sort(
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
