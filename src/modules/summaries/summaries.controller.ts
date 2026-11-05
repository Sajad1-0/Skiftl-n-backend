import type { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';

import { AppError } from '../../middleware/error.middleware.js';
import { monthlySummaryQuerySchema } from './summaries.schema.js';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { getMonthlySummary } from './summaries.service.js';
import { userHasPremium } from '../../lib/premium/premium.js';
import { buildMonthlySummaryPdf } from '../../lib/pdf/monthly-report.js';
import { stockholmDateKey } from '../../lib/sick/sick-pay.js';

function requiredUser(req: Request): string {
  if (!req.user) throw new AppError(401, 'Inte autentiserad');
  return req.user.userId;
}

export async function getMonthlySummaryController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requiredUser(req);
    const parsed = monthlySummaryQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      next(new AppError(400, 'Ogiltiga query-parametrar (from, to krävs)'));
      return;
    }

    const summary = await getMonthlySummary(userId, parsed.data);

    res.status(200).json({
      success: true,
      message: 'Månadssammanfattning hämtad',
      data: summary,
    });
  } catch (error) {
    next(error);
  }
}

export async function downloadMonthlySummaryPdfController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const userId = requiredUser(req);
    if (!(await userHasPremium(userId))) {
      next(new AppError(403, 'PDF-rapport kräver Premium'));
      return;
    }

    const parsed = monthlySummaryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(new AppError(400, 'Ogiltiga query-parametrar'));
      return;
    }

    const summary = await getMonthlySummary(userId, parsed.data);

    const userRows = await db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const u = userRows[0];
    const nameParts = [u?.firstName, u?.lastName].filter(Boolean);
    const userLabel = nameParts.length > 0 ? nameParts.join(' ') : (u?.email ?? 'Anvandare');
    const fromKey = stockholmDateKey(summary.from);
    const toKey = stockholmDateKey(summary.to);

    const pdfBytes = await buildMonthlySummaryPdf(summary, {
      userLabel,
      monthLabel: `${fromKey} - ${toKey}`,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="shiftkit-manad-${fromKey}.pdf"`);
    res.status(200).send(Buffer.from(pdfBytes));
  } catch (error) {
    next(error);
  }
}

