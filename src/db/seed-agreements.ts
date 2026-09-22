import 'dotenv/config';

import { eq } from 'drizzle-orm';

import { db } from './index.js';
import {
  collectiveAgreements,
  collectiveAgreementVersions,
  obRules,
  publicDayBeforeHolidays,
  publicHolidays,
} from './schema.js';

async function upsertAgreement(code: string, name: string, description: string) {
  const existing = await db
    .select()
    .from(collectiveAgreements)
    .where(eq(collectiveAgreements.code, code))
    .limit(1);

  if (existing[0]) return existing[0];

  const inserted = await db
    .insert(collectiveAgreements)
    .values({ code, name, description, isActive: true })
    .returning();

  const row = inserted[0];
  if (!row) throw new Error(`Kunde inte skapa avtal ${code}`);
  return row;
}

async function seed() {
  // Handles-lik mall (skallbarhet)
  const handels = await upsertAgreement(
    'handels_retail',
    'Handels detaljhandel',
    'Exempelmall: vardag 18-20 -> 50%, 20-06 -> 70%, söndag/helgdag -> 100%, Inte officiellt avtal',
  );

  const hVersions = await db
    .select()
    .from(collectiveAgreementVersions)
    .where(eq(collectiveAgreementVersions.agreementId, handels.id))
    .limit(1);

  let hVersion = hVersions[0];
  if (!hVersion) {
    const inserted = await db
      .insert(collectiveAgreementVersions)
      .values({
        agreementId: handels.id,
        label: '2026',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        effectiveTo: null,
      })
      .returning();

    hVersion = inserted[0]!;
  }

  const hRules = await db.select().from(obRules).where(eq(obRules.versionId, hVersion.id));
  if (hRules.length === 0) {
    await db.insert(obRules).values([
      {
        versionId: hVersion.id,
        dayKind: 'weekday',
        startTime: '18:00:00',
        endTime: '20:00:00',
        obPercent: '50.00',
        priority: 10,
        label: 'Vardag 18-20',
      },
      {
        versionId: hVersion.id,
        dayKind: 'weekday',
        startTime: '20:00:00',
        endTime: '06:00:00',
        obPercent: '70.00',
        priority: 10,
        label: 'Vardag 20-06',
      },
      {
        versionId: hVersion.id,
        dayKind: 'saturday',
        startTime: '12:00:00',
        endTime: '00:00:00',
        obPercent: '100.00',
        priority: 20,
        label: 'Lördag 12-06',
      },
      {
        versionId: hVersion.id,
        dayKind: 'dayBeforeHoliday',
        startTime: '12:00:00',
        endTime: '00:00:00',
        obPercent: '100.00',
        priority: 20,
        label: 'Afton dagar 12-06',
      },
      {
        versionId: hVersion.id,
        dayKind: 'sunday',
        startTime: '00:00:00',
        endTime: '00:00:00',
        obPercent: '100.00',
        priority: 20,
        label: 'Söndag',
      },
      {
        versionId: hVersion.id,
        dayKind: 'holiday',
        startTime: '00:00:00',
        endTime: '00:00:00',
        obPercent: '100.00',
        label: 'Helgdag',
      },
    ]);
  }

  // SE-helgdagar 2025 (utöka senare)
  const holidays = [
    { holidayDate: '2026-01-01', name: 'Nyårsdag' },
    { holidayDate: '2026-01-06', name: 'Trettondedag jul' },
    { holidayDate: '2026-04-03', name: 'Långfredagen' },
    { holidayDate: '2026-04-05', name: 'Påskdagen' },
    { holidayDate: '2026-04-06', name: 'Annandag påsk' },
    { holidayDate: '2026-05-01', name: 'Första maj' },
    { holidayDate: '2026-05-14', name: 'Kristi himmelsfärdag' },
    { holidayDate: '2026-05-24', name: 'Pingstdagen' },
    { holidayDate: '2026-06-06', name: 'Nationaldagen' },
    { holidayDate: '2026-06-20', name: 'Midsommardagen' },
    { holidayDate: '2026-10-31', name: 'Alla helgons dag' },
    { holidayDate: '2026-12-25', name: 'Juldagen' },
    { holidayDate: '2026-12-26', name: 'Annandag jul' },
  ];

  // 100% OB efter kl 12:00
  const dayBeforeHolidays = [
    { dayBeforeHolidayDate: '2026-01-05', name: 'Trettondagsafton' },
    { dayBeforeHolidayDate: '2026-04-04', name: 'Påskafton' },
    { dayBeforeHolidayDate: '2026-06-19', name: 'Midsommarafton' },
    { dayBeforeHolidayDate: '2026-10-30', name: 'Alla helgons afton' },
    { dayBeforeHolidayDate: '2026-12-24', name: 'Jul afton' },
    { dayBeforeHolidayDate: '2026-12-31', name: 'Nyårsafton' },
  ];

  for (const h of holidays) {
    await db
      .insert(publicHolidays)
      .values({ ...h, region: 'SE' })
      .onConflictDoNothing();
  }

  for (const dbh of dayBeforeHolidays) {
    await db
      .insert(publicDayBeforeHolidays)
      .values({ ...dbh, region: 'SE' })
      .onConflictDoNothing();
  }

  console.log('Seed klar: handels_retail, public_holidays, dayBeforePublicHolidays');
}
