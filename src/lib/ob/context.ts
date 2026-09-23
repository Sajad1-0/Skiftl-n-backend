import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';

import { db } from '../../db/index.js';
import {
  collectiveAgreementVersions,
  obRules,
  publicDayBeforeHolidays,
  publicHolidays,
} from '../../db/schema.js';
import type { DayKind, ObRuleInput } from './types.js';

export interface ObPayContext {
  agreementVersionId: string;
  rules: ObRuleInput[];
  holiday: Set<string>;
  dayBeforeHolidays: Set<string>;
}

function asDayKind(value: string): DayKind {
  const allowed: DayKind[] = [
    'weekday',
    'saturday',
    'sunday',
    'holiday',
    'dayBeforeHoliday',
    'all',
  ];

  if (!allowed.includes(value as DayKind)) {
    throw new Error(`Okänd dayKind i OB-regel: ${value}`);
  }

  return value as DayKind;
}

/** Hitta version som gäller för `at` (passets start). */
export async function findEffectiveVersion(
  agreementId: string,
  at: Date,
): Promise<{ id: string } | null> {
  const rows = await db
    .select({
      id: collectiveAgreementVersions.id,
      effectiveFrom: collectiveAgreementVersions.effectiveFrom,
      effectiveTo: collectiveAgreementVersions.effectiveTo,
    })
    .from(collectiveAgreementVersions)
    .where(
      and(
        eq(collectiveAgreementVersions.agreementId, agreementId),
        lte(collectiveAgreementVersions.effectiveFrom, at),
        or(
          isNull(collectiveAgreementVersions.effectiveTo),
          gte(collectiveAgreementVersions.effectiveTo, at),
        ),
      ),
    )
    .orderBy(desc(collectiveAgreementVersions.effectiveFrom))
    .limit(1);

  return rows[0] ?? null;
}

export async function loadObPayContext(
  agreementId: string,
  at: Date,
): Promise<ObPayContext | null> {
  const version = await findEffectiveVersion(agreementId, at);
  if (!version) return null;

  const ruleRows = await db.select().from(obRules).where(eq(obRules.versionId, version.id));

  const rules: ObRuleInput[] = ruleRows.map((r) => ({
    dayKind: asDayKind(r.dayKind),
    startTime: String(r.startTime),
    endTime: String(r.endTime),
    obPercent: Number(r.obPercent),
    priority: r.priority,
    label: r.label,
  }));

  const holidayRows = await db.select({ d: publicHolidays.holidayDate }).from(publicHolidays);
  const aftonRows = await db
    .select({ d: publicDayBeforeHolidays.dayBeforeHolidayDate })
    .from(publicDayBeforeHolidays);

  return {
    agreementVersionId: version.id,
    rules,
    holiday: new Set(holidayRows.map((h) => h.d)),
    dayBeforeHolidays: new Set(aftonRows.map((a) => a.d)),
  };
}
