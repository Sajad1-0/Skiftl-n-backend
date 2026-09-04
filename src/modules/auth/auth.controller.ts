import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../middleware/error.middleware.js';
import { loginSchema, registerSchema } from './auth.schema.js';
import { getCurrentUserById, loginUser, registerUser } from './auth.service.js';

export async function registerController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsedBody = registerSchema.safeParse(req.body);

    if (!parsedBody.success) {
      next(new AppError(400, 'Ogiltig registreringsdata'));
      return;
    }

    const result = await registerUser(parsedBody.data);

    res.status(201).json({
      success: true,
      message: 'Användaren skapades',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function loginController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsedBody = loginSchema.safeParse(req.body);

    if (!parsedBody.success) {
      next(new AppError(400, 'Ogiltig inloggningsdata'));
      return;
    }

    const result = await loginUser(parsedBody.data);

    res.status(200).json({
      success: true,
      message: 'Inloggning lyckades',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getCurrentUserController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      next(new AppError(401, 'Inte autentiserad'));
      return;
    }

    const user = await getCurrentUserById(req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Nuvarande användare hämtad',
      data: user,
    });
  } catch (error) {
    next(error);
  }
}
