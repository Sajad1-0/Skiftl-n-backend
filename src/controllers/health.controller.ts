import type { Response, Request } from 'express';

export function getHealth(_req: Request, res: Response): void {
  res.status(200).json({
    success: true,
    message: 'Skiftlön API är igång',
    timestamp: new Date().toISOString(),
  });
}
