import { userHasPremium } from './premium.js';
import {
  sameStockholmMonth,
  stockholmMonthQueryRange,
  stockholmYearMonth,
} from '../tax/month-bounds.js';
import { AppError } from '../../middleware/error.middleware.js';

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

  const effectiveFrom = from ?? current.from;
  const effectiveTo = to ?? current.to;

  // Både ändpunkter måste ligga i innevarande Stockholm-månad
  if (!sameStockholmMonth(effectiveFrom, now) || !sameStockholmMonth(effectiveTo, now)) {
    const { year, month } = stockholmYearMonth(now);
    throw new AppError(
      403,
      `Gratisplan tillåter bara innevarande månad (${year}-${String(month).padStart(2, '0')}). Uppgradera till Premium för historik.`,
    );
  }

  return { from: effectiveFrom, to: effectiveTo };
}

export async function assertPremiumTaxTable(userId: string): Promise<void> {
  if (!(await userHasPremium(userId))) {
    throw new AppError(
      403,
      'Skattetabell kräver premium. Använd manuell skattesats (%) på jobbprofilen.',
    );
  }
}
