import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../../middleware/error.middleware.js';
import { upsertTaxSettingsSchema } from './tax-settings.schema.js';
import { getTaxSettings, upsertTaxSettings } from './tax-settings.service.js';

function requiredUser(req: Request): string {
  if (!req.user) throw new AppError(401, 'Inte autentiserad');
  return req.user.userId;
}

export async function getTaxSettingsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requiredUser(req);
    const settings = await getTaxSettings(userId);

    res.status(200).json({
      success: true,
      message: settings ? 'Skatteinställningar hämtade' : 'Inga skatteinställningar sparade',
      data: settings,
    });
  } catch (error) {
    next(error);
  }
}

export async function upsertTaxSettingsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requiredUser(req);
    const parsed = upsertTaxSettingsSchema.safeParse(req.body);

    if (!parsed.success) {
      next(new AppError(400, 'Ogiltiga skatteinställningar'));
      return;
    }

    const settings = await upsertTaxSettings(userId, parsed.data);

    res.status(200).json({
      success: true,
      message: 'Skatteinställningar sparade',
      data: settings,
    });
  } catch (error) {
    next(error);
  }
}
