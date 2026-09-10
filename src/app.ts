import express, { type Express } from 'express';
import cors from 'cors';

import { errorHandler } from './middleware/error.middleware.js';
import authRoutes from './modules/auth/auth.routes.js';
import jobProfileRouter from './modules/job-profiles/job-profile.routes.js';
import healthRoutes from './routes/health.routes.js';

export function createApp(): Express {
  const app = express();

  // Global Middleware
  app.use(cors());
  app.use(express.json());

  //Routes
  app.use('/health', healthRoutes);
  app.use('/auth', authRoutes);
  app.use('/job-profiles', jobProfileRouter);

  // Error handler - Måste vara sist
  app.use(errorHandler);

  return app;
}
