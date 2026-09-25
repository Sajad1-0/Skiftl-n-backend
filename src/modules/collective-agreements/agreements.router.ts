import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.middleware.js';
import { listAgreementsController } from './agreements.controller.js';

const router: Router = Router();

router.use(requireAuth);
router.get('/', listAgreementsController);

export default router;
