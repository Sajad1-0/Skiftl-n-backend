import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../../middleware/error.middleware.js';
import { listActiveAgreements } from './agreements.service.js';

function requiredUser(req: Request): string {
  if (!req.user) throw new AppError(401, 'Inte autentiserad');
  return req.user.userId;
}

export async function listAgreementsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    requiredUser(req);
    const agreements = await listActiveAgreements();

    res.status(200).json({
      success: true,
      message: 'Kollektivavtal hämtade',
      data: agreements,
    });
  } catch (error) {
    next(error);
  }
}
