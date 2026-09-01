import express, { type Express } from 'express';
import cors from 'cors';
import healthRoutes from './routes/health.routes.js';
import { errorHandler } from './middleware/error.middleware.js';

export function createApp(): Express {
  const app = express();

  // Global Middleware
  app.use(cors());
  app.use(express.json());

  //Routes
  app.use('/health', healthRoutes);

  // Error handler - Måste vara sist
  app.use(errorHandler);

  return app;
}
