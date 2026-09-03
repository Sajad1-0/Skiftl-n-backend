import type { Response, Request } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

export async function getHealth(_req: Request, res: Response): Promise<void> {
  try {
    await db.execute(sql`SELECT 1`);

    res.status(200).json({
      success: true,
      message: 'Skiftlön API är igång',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      success: false,
      message: 'API igång men databas otillgängligt',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
    });
  }
}
