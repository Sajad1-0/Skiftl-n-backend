import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.middleware.js';
import { createCheckoutController, createPortalController } from './billing.controller.js';

const router: Router = Router();

router.use(requireAuth);
router.post('/checkout', createCheckoutController);
router.post('/portal', createPortalController);

export default router;
