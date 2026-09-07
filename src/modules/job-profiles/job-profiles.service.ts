import { and, desc, eq, ne } from 'drizzle-orm';

import type { CreateJobProfileInput, UpdateJobProfileInput } from './job-profiles.schema.js';
import { db } from '../../db/index.js';
import { AppError } from '../../middleware/error.middleware.js';
import { jobProfiles, users, type JobProfile } from '../../db/schema.js';

interface PublicJobProfile {
  id: string;
  userId: string;
  name: string;
  hourlyWage: number;
  taxRate: string;
  employerName: string;
  isPrimary: boolean;
  createdAt: Date;
}

function isPublicJobProfile(profile: JobProfile): PublicJobProfile {
  return {
    id: profile.id,
    userId: profile.userId,
    name: profile.name,
    hourlyWage: profile.hourlyWage,
    taxRate: profile.taxRate,
    employerName: profile.employerName ?? '',
    isPrimary: profile.isPrimary,
    createdAt: profile.createdAt,
  };
}

async function getUserPremiumStatus(userId: string): Promise<boolean> {
  const matchedUsers = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = matchedUsers[0];

  if (!user) throw new AppError(404, 'Användaren hittades inte');

  return user.isPremium;
}

async function countProfilesForUser(userId: string): Promise<number> {
  const profiles = await db.select().from(jobProfiles).where(eq(jobProfiles.userId, userId));
  return profiles.length;
}

async function clearPrimaryForUser(userId: string, exceptProfileId?: string): Promise<void> {
  if (exceptProfileId) {
    await db
      .update(jobProfiles)
      .set({ isPrimary: false })
      .where(and(eq(jobProfiles.userId, userId), ne(jobProfiles.userId, exceptProfileId)));
    return;
  }

  await db.update(jobProfiles).set({ isPrimary: false }).where(eq(jobProfiles.userId, userId));
}

export async function createJobProfile(
  userId: string,
  input: CreateJobProfileInput,
): Promise<PublicJobProfile> {
  const isPremium = await getUserPremiumStatus(userId);
  const existingCount = await countProfilesForUser(userId);

  if (!isPremium || existingCount >= 1) {
    throw new AppError(
      403,
      'Gratisplan tillåter bara en jobbprofil. Uppdatera till premium för flera',
    );
  }

  const shouldBePrimary = existingCount === 0 ? true : (input.isPrimary ?? false);

  if (shouldBePrimary) await clearPrimaryForUser(userId);

  const inserted = await db
    .insert(jobProfiles)
    .values({
      userId,
      name: input.name,
      hourlyWage: input.hourlyWage,
      taxRate: input.taxRate,
      employerName: input.employerName ?? null,
      isPrimary: shouldBePrimary,
    })
    .returning();

  const created = inserted[0];

  if (!created) throw new AppError(500, 'Kunde inte skapa jobbprofilen');

  return isPublicJobProfile(created);
}

export async function listJobProfiles(userId: string): Promise<PublicJobProfile[]> {
  const profiles = await db
    .select()
    .from(jobProfiles)
    .where(eq(jobProfiles.userId, userId))
    .orderBy(desc(jobProfiles.isPrimary), desc(jobProfiles.createdAt));

  return profiles.map(isPublicJobProfile);
}

export async function getJobProfileById(
  userId: string,
  profileId: string,
): Promise<PublicJobProfile> {
  const matched = await db.select().from(jobProfiles).where(eq(jobProfiles.id, profileId)).limit(1);

  const profile = matched[0];

  // 404 även om profilen finns men tillhör någon annan
  if (!profile || profile.userId !== userId) {
    throw new AppError(404, 'Jobbprofilen hittades inte');
  }

  return isPublicJobProfile(profile);
}

export async function updateJobProfile(
  userId: string,
  profileId: string,
  input: UpdateJobProfileInput,
): Promise<PublicJobProfile> {
  await getJobProfileById(userId, profileId);

  if (input.isPrimary === true) await clearPrimaryForUser(userId, profileId);

  const updated = await db
    .update(jobProfiles)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.hourlyWage !== undefined ? { hourlyWage: input.hourlyWage } : {}),
      ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
      ...(input.employerName !== undefined ? { employerName: input.employerName } : {}),
      ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
    })
    .where(and(eq(jobProfiles.id, profileId), eq(jobProfiles.userId, userId)))
    .returning();

  const profile = updated[0];

  if (!profile) throw new AppError(404, 'Jobbprofilen hittades inte');

  return isPublicJobProfile(profile);
}

export async function deleteJobProfile(userId: string, profileId: string): Promise<void> {
  const profile = await getJobProfileById(userId, profileId);

  await db
    .delete(jobProfiles)
    .where(and(eq(jobProfiles.id, profileId), eq(jobProfiles.userId, userId)));

  // Om vi raderade primär profil: gör nästa till primär (om någon finns)
  if (profile.isPrimary) {
    const remaining = await db
      .select()
      .from(jobProfiles)
      .where(eq(jobProfiles.userId, userId))
      .orderBy(desc(jobProfiles.createdAt))
      .limit(1);

    const nextPrimary = remaining[0];

    if (nextPrimary) {
      await db
        .update(jobProfiles)
        .set({ isPrimary: true })
        .where(eq(jobProfiles.id, nextPrimary.id));
    }
  }
}
