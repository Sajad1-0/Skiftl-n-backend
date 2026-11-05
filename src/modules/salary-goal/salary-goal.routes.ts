import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.middleware.js';
import { getSalaryGoalController, upsertSalaryGoalController } from './salary-goal.controller.js';

const router: Router = Router();
router.use(requireAuth);

router.get('/', getSalaryGoalController);
router.put('/', upsertSalaryGoalController);

export default router;
