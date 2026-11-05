import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.middleware.js';
import {
  downloadMonthlySummaryPdfController,
  getMonthlySummaryController,
} from './summaries.controller.js';

const router: Router = Router();
router.use(requireAuth);

router.get('/monthly', getMonthlySummaryController);
router.get('/monthly/pdf', downloadMonthlySummaryPdfController);

export default router;
