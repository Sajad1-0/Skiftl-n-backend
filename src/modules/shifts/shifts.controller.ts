import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../../middleware/error.middleware.js';
import {
  createShiftSchema,
  listShiftsQuerySchema,
  shiftIdSchema,
  updateShiftSchema,
} from './shifts.schema.js';
import {
  createShift,
  deleteShift,
  getShiftById,
  listShifts,
  updateShift,
} from './shifts.service.js';

function requiredUser(req: Request): string {
  if (!req.user) throw new AppError(401, 'Inte autentiserad');

  return req.user.userId;
}

export async function createShiftController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requiredUser(req);
    const parsed = createShiftSchema.safeParse(req.body);

    if (!parsed.success) {
      next(new AppError(400, 'Ogiltig passdata'));
      return;
    }

    const shift = await createShift(userId, parsed.data);

    res.status(201).json({
      success: true,
      message: 'Passet skapades',
      data: shift,
    });
  } catch (error) {
    next(error);
  }
}

export async function listShiftsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requiredUser(req);
    const parsed = listShiftsQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      next(new AppError(400, 'Ogiltiga query-parametrar'));
      return;
    }

    const shifts = await listShifts(userId, parsed.data);

    res.status(200).json({
      success: true,
      message: 'Pass hämtade',
      data: shifts,
    });
  } catch (error) {
    next(error);
  }
}

export async function getShiftByIdController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requiredUser(req);
    const parsedParams = shiftIdSchema.safeParse(req.params);

    if (!parsedParams.success) {
      next(new AppError(400, 'Ogiltigt pass-id'));
      return;
    }

    const shift = await getShiftById(userId, parsedParams.data.id);

    res.status(200).json({
      success: true,
      message: 'Pass hämtat',
      data: shift,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateShiftController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requiredUser(req);
    const parsedParams = shiftIdSchema.safeParse(req.params);

    if (!parsedParams.success) {
      next(new AppError(400, 'Ogiltigt pass-id'));
      return;
    }

    const parsedBody = updateShiftSchema.safeParse(req.body);

    if (!parsedBody.success) {
      next(new AppError(400, 'Ogiltig uppdateringsdata'));
      return;
    }

    const shift = await updateShift(userId, parsedParams.data.id, parsedBody.data);

    res.status(200).json({
      success: true,
      message: 'Passet uppdaterades',
      data: shift,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteShiftController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requiredUser(req);
    const parsedParams = shiftIdSchema.safeParse(req.params);

    if (!parsedParams.success) {
      next(new AppError(400, 'Ogiltigt pass-id'));
      return;
    }

    await deleteShift(userId, parsedParams.data.id);

    res.status(200).json({
      success: true,
      message: 'Passet togs bort',
      data: null,
    });
  } catch (error) {
    next(error);
  }
}
