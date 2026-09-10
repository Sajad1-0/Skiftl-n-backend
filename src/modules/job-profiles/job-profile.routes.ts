import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.middleware.js';
import {
  createJobProfileController,
  updateJobProfileController,
  getJobProfileByIdController,
  listJobProfilesController,
  deleteJobProfileController,
} from './job-profiles.controller.js';

const router: Router = Router();

router.use(requireAuth);

router.post('/', createJobProfileController);
router.get('/', listJobProfilesController);
router.get('/:id', getJobProfileByIdController);
router.patch('/:id', updateJobProfileController);
router.delete('/:id', deleteJobProfileController);

export default router;
