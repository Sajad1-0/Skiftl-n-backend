import { and, desc, eq, isNull, ne } from 'drizzle-orm';

import type { CreateJobProfileInput, UpdateJobProfileInput } from './job-profiles.schema.js';
import { db } from '../../db/index.js';
import { AppError } from '../../middleware/error.middleware.js';
import { collectiveAgreements, jobProfiles, type JobProfile } from '../../db/schema.js';
import { userHasPremium } from '../../lib/premium/premium.js';
import {
  FREE_ACTIVE_PROFILE_CAP,
  PREMIUM_ACTIVE_PROFILE_CAP,
} from '../../lib/premium/profile-caps.js';

interface PublicJobProfile {
  id: string;
  userId: string;
  name: string;
  hourlyWage: number;
  taxRate: string;
  employerName: string | null;
  isPrimary: boolean;
  collectiveAgreementId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
}

function toPublicJobProfile(profile: JobProfile): PublicJobProfile {
  return {
    id: profile.id,
    userId: profile.userId,
    name: profile.name,
    hourlyWage: profile.hourlyWage,
    taxRate: profile.taxRate,
    employerName: profile.employerName ?? null,
    isPrimary: profile.isPrimary,
    collectiveAgreementId: profile.collectiveAgreementId ?? null,
    archivedAt: profile.archivedAt ?? null,
    createdAt: profile.createdAt,
  };
}

function isArchived(profile: JobProfile): boolean {
  return profile.archivedAt != null;
}

async function assertActiveAgreement(agreementId: string | null | undefined): Promise<void> {
  if (agreementId == null) return;

  const matched = await db
    .select({ id: collectiveAgreements.id })
    .from(collectiveAgreements)
    .where(and(eq(collectiveAgreements.id, agreementId), eq(collectiveAgreements.isActive, true)))
    .limit(1);

  if (!matched[0]) {
    throw new AppError(400, 'Kollektivavtalet hittades inte');
  }
}

async function getUserPremiumStatus(userId: string): Promise<boolean> {
  return userHasPremium(userId);
}

async function countActiveProfiles(userId: string): Promise<number> {
  const rows = await db
    .select({ id: jobProfiles.id })
    .from(jobProfiles)
    .where(and(eq(jobProfiles.userId, userId), isNull(jobProfiles.archivedAt)));

  return rows.length;
}

async function clearPrimaryForUser(userId: string, exceptProfileId?: string): Promise<void> {
  if (exceptProfileId) {
    await db
      .update(jobProfiles)
      .set({ isPrimary: false })
      .where(and(eq(jobProfiles.userId, userId), ne(jobProfiles.id, exceptProfileId)));
    return;
  }

  await db.update(jobProfiles).set({ isPrimary: false }).where(eq(jobProfiles.userId, userId));
}

export async function getOwnedJobProfile(userId: string, profileId: string): Promise<JobProfile> {
  const matched = await db.select().from(jobProfiles).where(eq(jobProfiles.id, profileId)).limit(1);
  const profile = matched[0];
  if (!profile || profile.userId !== userId) {
    throw new AppError(404, 'Jobbprofilen hittades inte');
  }

  return profile;
}

export async function createJobProfile(
  userId: string,
  input: CreateJobProfileInput,
): Promise<PublicJobProfile> {
  const isPremium = await getUserPremiumStatus(userId);
  const activeCount = await countActiveProfiles(userId);
  const cap = isPremium ? PREMIUM_ACTIVE_PROFILE_CAP : FREE_ACTIVE_PROFILE_CAP;

  if (activeCount >= cap) {
    throw new AppError(
      403,
      isPremium
        ? `Premium tillåter max ${PREMIUM_ACTIVE_PROFILE_CAP} aktiva jobbprofiler. Arkivera en först.`
        : 'Gratisplan tillåter bara en jobbprofil. Uppgradera till Premium för flera.',
    );
  }

  await assertActiveAgreement(input.collectiveAgreementId);

  const shouldBePrimary = activeCount === 0 ? true : (input.isPrimary ?? false);
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
      collectiveAgreementId: input.collectiveAgreementId ?? null,
      archivedAt: null,
    })
    .returning();

  const created = inserted[0];

  if (!created) throw new AppError(500, 'Kunde inte skapa jobbprofilen');

  return toPublicJobProfile(created);
}

export async function listJobProfiles(
  userId: string,
  options?: { includeArchived?: boolean },
): Promise<PublicJobProfile[]> {
  const includeArchived = options?.includeArchived === true;
  if (includeArchived && !(await userHasPremium(userId))) {
    throw new AppError(403, 'Arkiverade profiler kräver Premium');
  }

  const conditions = [eq(jobProfiles.userId, userId)];
  if (!includeArchived) {
    conditions.push(isNull(jobProfiles.archivedAt));
  }

  const profiles = await db
    .select()
    .from(jobProfiles)
    .where(and(...conditions))
    .orderBy(desc(jobProfiles.isPrimary), desc(jobProfiles.createdAt));

  return profiles.map(toPublicJobProfile);
}

export async function getJobProfileById(
  userId: string,
  profileId: string,
): Promise<PublicJobProfile> {
  return toPublicJobProfile(await getOwnedJobProfile(userId, profileId));
}

/** För nya pass / byte till profil: måste ägas och vara aktiv. */
export async function getActiveOwnedJobProfile(
  userId: string,
  profileId: string,
): Promise<JobProfile> {
  const profile = await getOwnedJobProfile(userId, profileId);
  if (isArchived(profile)) {
    throw new AppError(400, 'Jobbprofilen är arkiverad. Återställ den eller välj en aktiv profil.');
  }

  return profile;
}

export async function updateJobProfile(
  userId: string,
  profileId: string,
  input: UpdateJobProfileInput,
): Promise<PublicJobProfile> {
  const existing = await getOwnedJobProfile(userId, profileId);
  if (isArchived(existing)) {
    throw new AppError(400, 'Arkiverad profil kan inte redigeras. Återställ den först');
  }

  if (input.collectiveAgreementId !== undefined) {
    await assertActiveAgreement(input.collectiveAgreementId);
  }

  if (input.isPrimary === true) {
    await clearPrimaryForUser(userId, profileId);
  }
  const updated = await db
    .update(jobProfiles)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.hourlyWage !== undefined ? { hourlyWage: input.hourlyWage } : {}),
      ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
      ...(input.employerName !== undefined ? { employerName: input.employerName } : {}),
      ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
      ...(input.collectiveAgreementId !== undefined
        ? { collectiveAgreementId: input.collectiveAgreementId }
        : {}),
    })
    .where(and(eq(jobProfiles.id, profileId), eq(jobProfiles.userId, userId)))
    .returning();
  const profile = updated[0];
  if (!profile) {
    throw new AppError(404, 'Jobbprofilen hittades inte');
  }
  return toPublicJobProfile(profile);
}

export async function archiveJobProfile(
  userId: string,
  profileId: string,
): Promise<PublicJobProfile> {
  const profile = await getOwnedJobProfile(userId, profileId);
  if (isArchived(profile)) {
    throw new AppError(400, 'Profilen är redan arkiverad');
  }

  const activeCount = await countActiveProfiles(userId);
  if (activeCount <= 1) {
    throw new AppError(400, 'Du måste ha minst en aktiv jobbprofil');
  }

  const updated = await db
    .update(jobProfiles)
    .set({ archivedAt: new Date(), isPrimary: false })
    .where(and(eq(jobProfiles.id, profileId), eq(jobProfiles.userId, userId)))
    .returning();

  const archived = updated[0];
  if (!archived) throw new AppError(404, 'Jobbprofilen hittades inte');

  if (profile.isPrimary) {
    const next = await db
      .select()
      .from(jobProfiles)
      .where(and(eq(jobProfiles.userId, userId), isNull(jobProfiles.archivedAt)))
      .orderBy(desc(jobProfiles.createdAt))
      .limit(1);
    if (next[0]) {
      await db.update(jobProfiles).set({ isPrimary: true }).where(eq(jobProfiles.id, next[0].id));
    }
  }

  return toPublicJobProfile(archived);
}

export async function unarchiveJobProfile(
  userId: string,
  profileId: string,
): Promise<PublicJobProfile> {
  if (!(await userHasPremium(userId))) {
    throw new AppError(403, 'Återställning av arkiverad profil kräver Premium');
  }

  const profile = await getOwnedJobProfile(userId, profileId);
  if (!isArchived(profile)) {
    throw new AppError(400, 'Profilen är redan aktiv');
  }

  const activeCount = await countActiveProfiles(userId);
  if (activeCount >= PREMIUM_ACTIVE_PROFILE_CAP) {
    throw new AppError(
      403,
      `Premium tillåter max ${PREMIUM_ACTIVE_PROFILE_CAP} aktiva profiler. Arkivera en först.`,
    );
  }

  const updated = await db
    .update(jobProfiles)
    .set({ archivedAt: null })
    .where(and(eq(jobProfiles.id, profileId), eq(jobProfiles.userId, userId)))
    .returning();

  const row = updated[0];
  if (!row) throw new AppError(404, 'Jobbprofilen hittades inte');

  return toPublicJobProfile(row);
}

/**
 * Vid downgrade: behåll en aktiv (primär om finns), arkivera resten.
 */
export async function forceArchiveExtrasOnDowngrade(userId: string): Promise<void> {
  const active = await db
    .select()
    .from(jobProfiles)
    .where(and(eq(jobProfiles.userId, userId), isNull(jobProfiles.archivedAt)))
    .orderBy(desc(jobProfiles.isPrimary), desc(jobProfiles.createdAt));

  if (active.length <= FREE_ACTIVE_PROFILE_CAP) return;

  const keep = active[0];
  const toArchive = active.slice(1);
  const now = new Date();

  for (const p of toArchive) {
    await db
      .update(jobProfiles)
      .set({ archivedAt: now, isPrimary: false })
      .where(eq(jobProfiles.id, p.id));
  }

  if (keep && !keep.isPrimary) {
    await clearPrimaryForUser(userId, keep.id);
    await db.update(jobProfiles).set({ isPrimary: true }).where(eq(jobProfiles.id, keep.id));
  }
}

export async function deleteJobProfile(userId: string, profileId: string): Promise<void> {
  const profile = await getOwnedJobProfile(userId, profileId);

  await db
    .delete(jobProfiles)
    .where(and(eq(jobProfiles.id, profileId), eq(jobProfiles.userId, userId)));

  // Om vi raderade primär profil: gör nästa till primär (om någon finns)
  if (profile.isPrimary && !isArchived(profile)) {
    const remaining = await db
      .select()
      .from(jobProfiles)
      .where(and(eq(jobProfiles.userId, userId), isNull(jobProfiles.archivedAt)))
      .orderBy(desc(jobProfiles.createdAt))
      .limit(1);

    if (remaining[0]) {
      await db
        .update(jobProfiles)
        .set({ isPrimary: true })
        .where(eq(jobProfiles.id, remaining[0].id));
    }
  }
}
