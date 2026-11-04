import type { Request, Response, NextFunction } from 'express';

import { AppError } from '../../middleware/error.middleware.js';
import { upsertSalaryGoal, getSalaryGoal } from './salary-goal.service.js';
import { upsertSalaryGoalSchema } from './salary-goal.schema.js';

function requiredUser(req: Request): string {
  if (!req.user) throw new AppError(401, 'Inte autentiserad');

  return req.user.userId;
}

export async function upsertSalaryGoalController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requiredUser(req);
    const parsed = upsertSalaryGoalSchema.safeParse(req.body);

    if (!parsed.success) {
      next(new AppError(400, 'Ogiltig salary data'));
      return;
    }

    const salaryData = await upsertSalaryGoal(userId, parsed.data.monthlySummaryGoal);

    res.status(200).json({
      success: true,
      message: 'Lönemål skapades',
      data: salaryData,
    });
  } catch (error) {
    next(error);
  }
}

export async function getSalaryGoalController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requiredUser(req);
    const salary = await getSalaryGoal(userId);

    res.status(200).json({
      success: true,
      message: 'Lönemål hämtats',
      data: salary,
    });
  } catch (error) {
    next(error);
  }
}
