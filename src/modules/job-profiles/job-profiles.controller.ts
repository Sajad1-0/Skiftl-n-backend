import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../../middleware/error.middleware.js';
import {
  createJobProfileSchema,
  jobProfileIdSchema,
  updateJobProfileSchema,
} from './job-profiles.schema.js';
import {
  createJobProfile,
  updateJobProfile,
  getJobProfileById,
  listJobProfiles,
  deleteJobProfile,
} from './job-profiles.service.js';

function requiredUser(req: Request): string {
  if (!req.user) throw new AppError(401, 'Inte autentiserad');

  return req.user.userId;
}

export async function createJobProfileController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requiredUser(req);
    const parsed = createJobProfileSchema.safeParse(req.body);

    if (!parsed.success) {
      next(new AppError(400, 'Ogiltig jobbprofildata'));
      return;
    }

    const profile = await createJobProfile(userId, parsed.data);

    res.status(201).json({
      success: true,
      message: 'Jobbprofilen skapades',
      data: profile,
    });
  } catch (error) {
    next(error);
  }
}

export async function listJobProfilesController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requiredUser(req);
    const profiles = await listJobProfiles(userId);

    res.status(200).json({
      success: true,
      message: 'Jobbprofiler hämtade',
      data: profiles,
    });
  } catch (error) {
    next(error);
  }
}

export async function getJobProfileByIdController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requiredUser(req);
    const parsedParams = jobProfileIdSchema.safeParse(req.params);

    if (!parsedParams.success) {
      next(new AppError(400, 'Ogiltig profile-id'));
      return;
    }

    const profileId = await getJobProfileById(userId, parsedParams.data.id);

    res.status(200).json({
      success: true,
      message: 'Jobbprofil hämtad',
      data: profileId,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateJobProfileController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requiredUser(req);
    const parsedParams = jobProfileIdSchema.safeParse(req.params);

    if (!parsedParams.success) {
      next(new AppError(400, 'Ogiltig profil-id'));
      return;
    }

    const parsedBody = updateJobProfileSchema.safeParse(req.body);

    if (!parsedBody.success) {
      next(new AppError(400, 'Ogiltig uppdateringsdata'));
      return;
    }

    if (Object.keys(parsedBody.data).length === 0) {
      next(new AppError(400, 'Ingen uppdateringsdata skickades'));
      return;
    }

    const updateProfile = await updateJobProfile(userId, parsedParams.data.id, parsedBody.data);

    res.status(200).json({
      success: true,
      message: 'Jobbprofilen uppdaterades',
      data: updateProfile,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteJobProfileController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requiredUser(req);
    const parsedParams = jobProfileIdSchema.safeParse(req.params);

    if (!parsedParams.success) {
      next(new AppError(400, 'Ogiltig profil-id'));
      return;
    }

    await deleteJobProfile(userId, parsedParams.data.id);

    res.status(200).json({
      success: true,
      message: 'Jobbprofilen togs bort',
      data: null,
    });
  } catch (error) {
    next(error);
  }
}
