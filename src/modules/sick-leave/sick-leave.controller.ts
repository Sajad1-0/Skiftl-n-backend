import type { Request, Response, NextFunction } from 'express';

import { AppError } from '../../middleware/error.middleware.js';

import {
  createSickLeaveSchema,
  listSickLeaveQuerySchema,
  updateSickLeaveSchema,
  sickLeaveIdSchema,
} from './sick-leave-schema.js';
import {
  createSickLeave,
  updatedSickLeave,
  listSickLeave,
  getSickLeaveById,
  deleteSickLeave,
} from './sick-leave.service.js';
import { success } from 'zod';
import { shiftIdSchema } from '../shifts/shifts.schema.js';

function requiredUser(req: Request): string {
  if (!req.user) throw new AppError(401, 'Inte autentiserad');

  return req.user.userId;
}

export async function createSickLeaveController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requiredUser(req);
    const parsed = createSickLeaveSchema.safeParse(req.body);

    if (!parsed.success) {
      next(new AppError(400, 'Inte giltig data'));
      return;
    }

    const sickLeave = await createSickLeave(userId, parsed.data);

    res.status(201).json({
      success: true,
      message: 'Sjukanmälan skapades',
      data: sickLeave,
    });
  } catch (error) {
    next(error);
  }
}

export async function listSickLeaveController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requiredUser(req);
    const queryData = listSickLeaveQuerySchema.safeParse(req.query);

    if (!queryData.success) {
      next(new AppError(400, 'Ogiltiga query-parametrar'));
      return;
    }

    const list = await listSickLeave(userId, queryData.data);
    res.status(200).json({
      success: true,
      message: 'Alla sjukanmälningar hämtats',
      data: list,
    });
  } catch (error) {
    next(error);
  }
}

export async function getSickLeaveByIdController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requiredUser(req);
    const parsedParams = sickLeaveIdSchema.safeParse(req.params);

    if (!parsedParams.success) {
      next(new AppError(400, 'Ogiltig params data'));
      return;
    }

    const sickLeave = await getSickLeaveById(userId, parsedParams.data.id);

    res.status(200).json({
      success: true,
      message: 'Sjulanmälan hämtats',
      data: sickLeave,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateSickLeaveController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requiredUser(req);
    const parsedParams = sickLeaveIdSchema.safeParse(req.params);

    if (!parsedParams.success) {
      next(new AppError(400, 'Ogiltig params'));
      return;
    }

    const updateData = updateSickLeaveSchema.safeParse(req.body);

    if (!updateData.success) {
      next(new AppError(400, 'Ogiltig updateDate'));
      return;
    }

    const updateSickData = await updatedSickLeave(userId, parsedParams.data.id, updateData.data);

    res.status(200).json({
      success: true,
      message: 'Sjukanmälan har upptaderats',
      data: updateSickData,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteSickLeaveController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requiredUser(req);
    const parsedParams = sickLeaveIdSchema.safeParse(req.params);

    if (!parsedParams.success) {
      next(new AppError(400, 'Ogiltig params data'));
      return;
    }

    await deleteSickLeave(userId, parsedParams.data.id);

    res.status(200).json({
      success: true,
      message: 'Sjukanmälan tagits bort',
      data: null,
    });
  } catch (error) {
    next(error);
  }
}
