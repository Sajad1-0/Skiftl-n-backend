import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
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
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [index('job_profiles_user_id_idx').on(table.userId)],
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

export const jobProfilesRelations = relations(jobProfiles, ({ one, many }) => ({
  user: one(users, {
    fields: [jobProfiles.userId],
    references: [users.id],
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
}));

// Infererade TypeScript-typer
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type JobProfile = typeof jobProfiles.$inferSelect;
export type NewJobProfile = typeof jobProfiles.$inferInsert;

export type Shift = typeof shifts.$inferSelect;
export type NewShift = typeof shifts.$inferInsert;
