import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../../middleware/auth.middleware.js';
import {
  loginController,
  getCurrentUserController,
  registerController,
} from './auth.controller.js';

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'För många auth-försök. Försök igen senare',
  },
});

const router: Router = Router();

router.post('/register', authRateLimit, registerController);
router.post('/login', authRateLimit, loginController);
router.get('/me', requireAuth, getCurrentUserController);

export default router;
