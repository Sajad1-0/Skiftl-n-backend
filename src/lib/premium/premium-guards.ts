import { userHasPremium } from './premium.js';
import {
  isWithinRecentStockholmMonths,
  PREMIUM_HISTORY_MONTHS,
  sameStockholmMonth,
  stockholmMonthQueryRange,
  stockholmYearMonth,
} from '../tax/month-bounds.js';
import { type BreakInterval, validateBreakIntervals, totalBreakMinutes } from '../breaks.js';
import { AppError } from '../../middleware/error.middleware.js';

export interface HistoryRange {
  from: Date;
  to: Date;
  isPremium: boolean;
}

export interface ResolveBreaks {
  breakMinutes: number;
  breakIntervals: BreakInterval[] | null;
}

/**
 * Free: innevarande Stockholm-månad.
 * Premium: from/to måste ligga inom 6 Stockholm-månaderna.
 */
export async function resolveHistoryRange(
  userId: string,
  from: Date | undefined,
  to: Date | undefined,
): Promise<HistoryRange> {
  const isPremium = await userHasPremium(userId);
  const now = new Date();
  const current = stockholmMonthQueryRange(now);

  if (!isPremium) {
    if (from && !sameStockholmMonth(from, now)) {
      throwForbiddenCurrentMonth(now);
    }
    if (to && !sameStockholmMonth(to, now)) {
      throwForbiddenCurrentMonth(now);
    }
    return { ...current, isPremium: false };
  }

  if (!from || !to) {
    throw new AppError(400, 'from och to krävs');
  }

  if (from.getTime() > to.getTime()) {
    throw new AppError(400, 'from måste vara före eller lika med to');
  }

  if (!isWithinRecentStockholmMonths(from, now) || !isWithinRecentStockholmMonths(to, now)) {
    throw new AppError(
      403,
      `Premium tillåter historik för de senaste ${PREMIUM_HISTORY_MONTHS} månaderna.`,
    );
  }

  return { from, to, isPremium: true };
}

function throwForbiddenCurrentMonth(now: Date): never {
  const { year, month } = stockholmYearMonth(now);
  throw new AppError(
    403,
    `Gratisplan tillåter bara innevarande månad (${year}-${String(month).padStart(2, '0')}). Uppgradera till Premium för historik.`,
  );
}

export async function assertPremiumTaxTable(userId: string): Promise<void> {
  if (!(await userHasPremium(userId))) {
    throw new AppError(
      403,
      'Skattetabell kräver Premium. Använd manuell skattesats (%) på jobbprofilen.',
    );
  }
}

/** Free: innevarande månad. Premium: senaste 6 månaderna. */
export async function assertFreeCanAccessShiftStart(
  userId: string,
  shiftStartAt: Date,
): Promise<void> {
  const now = new Date();
  if (await userHasPremium(userId)) {
    if (!isWithinRecentStockholmMonths(shiftStartAt, now)) {
      throw new AppError(
        403,
        `Premium tillåter pass inom de senaste ${PREMIUM_HISTORY_MONTHS} månaderna.`,
      );
    }
    return;
  }
  if (!sameStockholmMonth(shiftStartAt, now)) {
    throwForbiddenCurrentMonth(now);
  }
}

/**
 * Free: endast breakMinutes; icke-tom breakIntervals → 403.
 * Premium: icke-tom breakIntervals → validera + härled breakMinutes.
 *          tom [] / undefined → behåll breakMinutes (minuter-läge, bakåtkompat).
 */

export async function resolveShiftBreaks(
  userId: string,
  shiftStart: Date,
  shiftEnd: Date,
  breakMinutes: number | undefined,
  breakIntervals: BreakInterval[] | undefined,
): Promise<ResolveBreaks> {
  const premium = await userHasPremium(userId);
  const hasExactIntervals = breakIntervals !== undefined && breakIntervals.length > 0;

  if (!premium) {
    if (hasExactIntervals) {
      throw new AppError(403, 'Exakta rastintervall kräver Premium. Ange rast i minuter.');
    }
    return { breakMinutes: breakMinutes ?? 0, breakIntervals: null };
  }

  if (hasExactIntervals) {
    validateBreakIntervals(shiftStart, shiftEnd, breakIntervals);
    return {
      breakMinutes: totalBreakMinutes(breakIntervals),
      breakIntervals,
    };
  }

  // undefined eller []: inte intervall-läge — nolla inte explicit breakMinutes
  return { breakMinutes: breakMinutes ?? 0, breakIntervals: null };
}
