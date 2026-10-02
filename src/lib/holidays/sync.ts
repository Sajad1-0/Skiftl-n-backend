import { and, eq, gte, lte } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { publicDayBeforeHolidays, publicHolidays } from '../../db/schema.js';
import { swedishHolidaysForYears } from './swedish.js';

const REGION = 'SE';

/** Drizzle tx and root `db` share the same query API we need. */
type HolidayDb = Pick<typeof db, 'insert' | 'delete'>;

async function writeHolidayCalendar(
  client: HolidayDb,
  fromYear: number,
  toYear: number,
): Promise<{ holidayCount: number; aftonCount: number }> {
  const { holidays, aftons } = swedishHolidaysForYears(fromYear, toYear);

  for (const h of holidays) {
    await client
      .insert(publicHolidays)
      .values({ holidayDate: h.date, name: h.name, region: REGION })
      .onConflictDoNothing();
  }

  // Bara aftnar i synkat intervall — lämna andra år orörda
  await client
    .delete(publicDayBeforeHolidays)
    .where(
      and(
        eq(publicDayBeforeHolidays.region, REGION),
        gte(publicDayBeforeHolidays.dayBeforeHolidayDate, `${fromYear}-01-01`),
        lte(publicDayBeforeHolidays.dayBeforeHolidayDate, `${toYear}-12-31`),
      ),
    );

  for (const a of aftons) {
    await client.insert(publicDayBeforeHolidays).values({
      dayBeforeHolidayDate: a.date,
      name: a.name,
      region: REGION,
    });
  }

  return { holidayCount: holidays.length, aftonCount: aftons.length };
}

/**
 * Synka SE-helgdagar och Handels-aftnar till DB.
 * Om `tx` skickas in används den (samma transaction som anroparen).
 * Annars öppnas en egen transaction.
 */
export async function syncSwedishHolidayCalendar(
  fromYear: number,
  toYear: number,
  tx?: HolidayDb,
): Promise<{ holidayCount: number; aftonCount: number }> {
  if (tx) {
    return writeHolidayCalendar(tx, fromYear, toYear);
  }

  return db.transaction(async (innerTx) => writeHolidayCalendar(innerTx, fromYear, toYear));
}
