import type { NextFunction, Request, Response } from 'express';
import { AppError } from './error.middleware.js';
import { verifyToken } from '../modules/auth/auth.service.js';

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authorizationHeader = req.headers.authorization;

  if (!authorizationHeader) {
    next(new AppError(401, 'Authorization-header saknas'));
    return;
  }

  const [scheme, token] = authorizationHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    next(new AppError(401, 'Ogiltigt Authorization-format'));
    return;
  }

  try {
    const payload = verifyToken(token);

    req.user = {
      userId: payload.userId,
      email: payload.email,
    };

    next();
  } catch (error) {
    next(error);
  }
}
