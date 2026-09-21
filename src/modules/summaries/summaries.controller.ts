import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../../middleware/error.middleware.js';
import { monthlySummaryQuerySchema } from './summaries.schema.js';
import { getMonthlySummary } from './summaries.service.js';

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
