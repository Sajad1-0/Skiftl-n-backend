import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.middleware.js';
import {
  createShiftController,
  listShiftsController,
  getShiftByIdController,
  updateShiftController,
  deleteShiftController,
} from './shifts.controller.js';

const router: Router = Router();
router.use(requireAuth);

router.post('/', createShiftController);
router.get('/', listShiftsController);
router.get('/:id', getShiftByIdController);
router.patch('/:id', updateShiftController);
router.delete('/:id', deleteShiftController);

export default router;
