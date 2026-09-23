import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// users
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  isPremium: boolean('is_premium').notNull().default(false),
  // Belopp i öre (heltal). Nettolön per månad.
  monthlySalaryGoal: integer('monthly_salary_goal'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Kollektivavtal
export const collectiveAgreements = pgTable('collective_agreements', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const collectiveAgreementVersions = pgTable(
  'collective_agreement_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agreementId: uuid('agreement_id')
      .notNull()
      .references(() => collectiveAgreements.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 100 }).notNull(), // t.ex. "2026"
    effectiveFrom: timestamp('effective_from', { withTimezone: true, mode: 'date' }).notNull(),
    effectiveTo: timestamp('effective_to', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('cav_agreement_id_idx').on(table.agreementId),
    index('cav_effective_from_idx').on(table.agreementId, table.effectiveFrom),
  ],
);

/**
 * OB-regel under en avtalsversion.
 * Tider i lokal "klocktid" (Europe/Stockholm i Fas 13).
 * Om endTime <= startTime ⇒ fönstret går över midnatt (t.ex. 20:00–06:00).
 * Heldag: startTime === endTime === 00:00:00.
 *
 * dayKind:
 *  - weekday  = mån–fre (som inte är helgdag)
 *  - saturday
 *  - sunday
 *  - holiday           = röd dag (public_holidays)
 *  - dayBeforeHoliday  = afton (public_day_before_holidays)
 *  - all               = alla dagar (använd sparsamt)
 */
export const obRules = pgTable(
  'ob_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => collectiveAgreementVersions.id, { onDelete: 'cascade' }),
    dayKind: varchar('day_kind', { length: 16 }).notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    // Tilläg i procent av timlön, t.ex. 70.00 = +70%
    obPercent: numeric('ob_percent', { precision: 5, scale: 2 }).notNull(),
    // Högre vinner vid överlap
    priority: smallint('priority').notNull().default(0),
    label: varchar('label', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [index('ob_rules_version_id_idx').on(table.versionId)],
);

export const publicHolidays = pgTable(
  'public_holidays',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Kalenderdatum i Sverige (ingen tidzon)
    holidayDate: date('holiday_date', { mode: 'string' }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    region: varchar('region', { length: 64 }).notNull().default('SE'),
  },
  (table) => [uniqueIndex('public_holiday_date_region_uidx').on(table.holidayDate, table.region)],
);
/** Afton-dagar (dagen före helgdag) — separat lista; kan senare härledas från public_holidays. */
export const publicDayBeforeHolidays = pgTable(
  'public_day_before_holidays',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dayBeforeHolidayDate: date('day_before_holiday_date', { mode: 'string' }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    region: varchar('region', { length: 64 }).notNull().default('SE'),
  },
  (table) => [
    uniqueIndex('public_day_before_holiday_date_region_uidx').on(
      table.dayBeforeHolidayDate,
      table.region,
    ),
  ],
);

// job_profiles
export const jobProfiles = pgTable(
  'job_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    // Timlön i öre per timme (brutto)
    hourlyWage: integer('hourly_wage').notNull(),
    // tex. 30.00 = 30%
    taxRate: numeric('tax_rate', { precision: 5, scale: 2 }).notNull(),
    employerName: varchar('employer_name', { length: 200 }),
    isPrimary: boolean('is_primary').notNull().default(false),
    // null = Ingen OB (bara grundlön)
    collectiveAgreementId: uuid('collective_agreement_id').references(
      () => collectiveAgreements.id,
      { onDelete: 'set null' },
    ),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('job_profiles_user_id_idx').on(table.userId),
    index('job_profiles_agreement_id_idx').on(table.collectiveAgreementId),
  ],
);

// Shifts
export const shifts = pgTable(
  'shifts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    jobProfileId: uuid('job_profile_id')
      .notNull()
      .references(() => jobProfiles.id, { onDelete: 'cascade' }),
    startAt: timestamp('start_at', { withTimezone: true, mode: 'date' }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true, mode: 'date' }).notNull(),
    breakMinutes: integer('break_minutes').notNull().default(0),
    notes: text('notes'),
    // SnapShot: vilken avtalsversion som användas vid beräkning
    agreementVersionId: uuid('agreement_version_id').references(
      () => collectiveAgreementVersions.id,
      { onDelete: 'set null' },
    ),
    // Grundlön utan OB (öre).
    baseOre: integer('base_ore'),
    obOre: integer('ob_ore'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('shifts_user_id_idx').on(table.userId),
    index('shifts_job_profile_id_idx').on(table.jobProfileId),
    index('shifts_user_id_start_at_idx').on(table.userId, table.startAt),
  ],
);

// Relations (För Drizzle queries med .with())
export const usersRelations = relations(users, ({ many }) => ({
  jobProfiles: many(jobProfiles),
  shifts: many(shifts),
}));

export const collectiveAgreementsRelations = relations(collectiveAgreements, ({ many }) => ({
  versions: many(collectiveAgreementVersions),
  jobProfiles: many(jobProfiles),
}));

export const collectiveAgreementVersionsRelations = relations(
  collectiveAgreementVersions,
  ({ one, many }) => ({
    agreement: one(collectiveAgreements, {
      fields: [collectiveAgreementVersions.agreementId],
      references: [collectiveAgreements.id],
    }),
    obRules: many(obRules),
    shifts: many(shifts),
  }),
);

export const obRulesRelations = relations(obRules, ({ one }) => ({
  version: one(collectiveAgreementVersions, {
    fields: [obRules.versionId],
    references: [collectiveAgreementVersions.id],
  }),
}));

export const jobProfilesRelations = relations(jobProfiles, ({ one, many }) => ({
  user: one(users, {
    fields: [jobProfiles.userId],
    references: [users.id],
  }),
  collectiveAgreement: one(collectiveAgreements, {
    fields: [jobProfiles.collectiveAgreementId],
    references: [collectiveAgreements.id],
  }),
  shifts: many(shifts),
}));

export const shiftsRelations = relations(shifts, ({ one }) => ({
  user: one(users, {
    fields: [shifts.userId],
    references: [users.id],
  }),
  jobProfile: one(jobProfiles, {
    fields: [shifts.jobProfileId],
    references: [jobProfiles.id],
  }),
  agreementVersion: one(collectiveAgreementVersions, {
    fields: [shifts.agreementVersionId],
    references: [collectiveAgreementVersions.id],
  }),
}));

// Infererade TypeScript-typer
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type JobProfile = typeof jobProfiles.$inferSelect;
export type NewJobProfile = typeof jobProfiles.$inferInsert;

export type Shift = typeof shifts.$inferSelect;
export type NewShift = typeof shifts.$inferInsert;

export type CollectiveAgreement = typeof collectiveAgreements.$inferSelect;
export type ObRule = typeof obRules.$inferSelect;
