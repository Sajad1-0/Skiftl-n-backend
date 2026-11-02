import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.middleware.js';
import {
  createSickLeaveController,
  updateSickLeaveController,
  listSickLeaveController,
  getSickLeaveByIdController,
  deleteSickLeaveController,
} from './sick-leave.controller.js';

const router: Router = Router();

router.use(requireAuth);

router.post('/', createSickLeaveController);
router.get('/', listSickLeaveController);
router.get('/:id', getSickLeaveByIdController);
router.patch('/:id', updateSickLeaveController);
router.delete('/:id', deleteSickLeaveController);

export default router;
