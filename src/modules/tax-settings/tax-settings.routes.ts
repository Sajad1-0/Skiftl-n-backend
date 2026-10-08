import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.middleware.js';
import {
  getTaxSettingsController,
  upsertTaxSettingsController,
} from './tax-settings.controller.js';

const router: Router = Router();

router.use(requireAuth);
router.get('/', getTaxSettingsController);
router.put('/', upsertTaxSettingsController);

export default router;
