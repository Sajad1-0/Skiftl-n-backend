import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.middleware.js';
import { getMonthlySummaryController } from './summaries.controller.js';

const router: Router = Router();
router.use(requireAuth);

router.get('/monthly', getMonthlySummaryController);

export default router;
