import 'dotenv/config';

import { desc, eq } from 'drizzle-orm';

import { db } from './index.js';
import {
  collectiveAgreements,
  collectiveAgreementVersions,
  obRules,
  publicDayBeforeHolidays,
  publicHolidays,
} from './schema.js';
import {
  HANDELS_AGREEMENT_CODE,
  HANDELS_AGREEMENT_DESCRIPTION,
  HANDELS_AGREEMENT_NAME,
  HANDELS_EFFECTIVE_FROM,
  HANDELS_EFFECTIVE_TO,
  HANDELS_OB_RULES,
  HANDELS_VERSION_LABEL,
} from '../lib/ob/handels-detaljhandel.js';
import { syncSwedishHolidayCalendar } from '../lib/holidays/sync.js';

function assertSeedAllowed(): void {
  if (process.env.NODE_ENV === 'production' && process.env.CONFIRM_SEED !== '1') {
    throw new Error(
      'Vägrar köra seed i production utan CONFIRM_SEED=1 (destruktiv uppdatering av OB-regler/aftnar).',
    );
  }
}

async function upsertAgreement(code: string, name: string, description: string) {
  const existing = await db
    .select()
    .from(collectiveAgreements)
    .where(eq(collectiveAgreements.code, code))
    .limit(1);

  if (existing[0]) {
    const updated = await db
      .update(collectiveAgreements)
      .set({ name, description, isActive: true })
      .where(eq(collectiveAgreements.id, existing[0].id))
      .returning();
    return updated[0]!;
  }

  const inserted = await db
    .insert(collectiveAgreements)
    .values({ code, name, description, isActive: true })
    .returning();

  const row = inserted[0];
  if (!row) throw new Error(`Kunde inte skapa avtal ${code}`);
  return row;
}

async function upsertHandelsVersion(agreementId: string) {
  const existing = await db
    .select()
    .from(collectiveAgreementVersions)
    .where(eq(collectiveAgreementVersions.agreementId, agreementId))
    .orderBy(desc(collectiveAgreementVersions.effectiveFrom))
    .limit(1);

  if (existing[0]) {
    const updated = await db
      .update(collectiveAgreementVersions)
      .set({
        label: HANDELS_VERSION_LABEL,
        effectiveFrom: HANDELS_EFFECTIVE_FROM,
        effectiveTo: HANDELS_EFFECTIVE_TO,
      })
      .where(eq(collectiveAgreementVersions.id, existing[0].id))
      .returning();
    return updated[0]!;
  }

  const inserted = await db
    .insert(collectiveAgreementVersions)
    .values({
      agreementId,
      label: HANDELS_VERSION_LABEL,
      effectiveFrom: HANDELS_EFFECTIVE_FROM,
      effectiveTo: HANDELS_EFFECTIVE_TO,
    })
    .returning();

  const row = inserted[0];
  if (!row) throw new Error('Kunde inte skapa avtalsversion');
  return row;
}

async function seed() {
  assertSeedAllowed();

  const handels = await upsertAgreement(
    HANDELS_AGREEMENT_CODE,
    HANDELS_AGREEMENT_NAME,
    HANDELS_AGREEMENT_DESCRIPTION,
  );

  const hVersion = await upsertHandelsVersion(handels.id);

  await db.transaction(async (tx) => {
    await tx.delete(obRules).where(eq(obRules.versionId, hVersion.id));

    await tx.insert(obRules).values(
      HANDELS_OB_RULES.map((rule) => ({
        versionId: hVersion.id,
        dayKind: rule.dayKind,
        startTime: rule.startTime.length === 5 ? `${rule.startTime}:00` : rule.startTime,
        endTime: rule.endTime.length === 5 ? `${rule.endTime}:00` : rule.endTime,
        obPercent: rule.obPercent.toFixed(2),
        priority: rule.priority,
        label: rule.label ?? null,
      })),
    );

    const fromYear = HANDELS_EFFECTIVE_FROM.getUTCFullYear();
    const toYear = HANDELS_EFFECTIVE_TO.getUTCFullYear();
    await syncSwedishHolidayCalendar(fromYear, toYear);
  });

  console.log('Seed klar: handels_retail (§ 8.1), SE-helgdagar, aftnar (jul/nyår/midsommar)');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
