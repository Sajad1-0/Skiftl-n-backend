import { userHasPremium } from './premium.js';
import {
  sameStockholmMonth,
  stockholmMonthQueryRange,
  stockholmYearMonth,
} from '../tax/month-bounds.js';
import { AppError } from '../../middleware/error.middleware.js';

/**
 * Free: endast innevarande Stockholm-månad (DB-query använder padded range).
 * Premium: returnerar angivet from/to.
 */
export async function resolveHistoryRange(
  userId: string,
  from: Date | undefined,
  to: Date | undefined,
): Promise<{ from: Date; to: Date }> {
  const premium = await userHasPremium(userId);
  const now = new Date();
  const current = stockholmMonthQueryRange(now);

  if (premium) {
    if (!from || !to) {
      throw new AppError(400, 'from och to krävs');
    }
    return { from, to };
  }

  // Klientens from/to får inte peka utanför innevarande Stockholm-månad
  if (from && !sameStockholmMonth(from, now)) {
    throwForbiddenCurrentMonth(now);
  }
  if (to && !sameStockholmMonth(to, now)) {
    throwForbiddenCurrentMonth(now);
  }

  return current;
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

/** Free: blockera läs/skriv av pass utanför innevarande Stockholm-månad. */
export async function assertFreeCanAccessShiftStart(
  userId: string,
  shiftStartAt: Date,
): Promise<void> {
  if (await userHasPremium(userId)) return;
  if (!sameStockholmMonth(shiftStartAt, new Date())) {
    throwForbiddenCurrentMonth(new Date());
  }
}
