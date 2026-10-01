import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { publicDayBeforeHolidays, publicHolidays } from '../../db/schema.js';
import { swedishHolidaysForYears } from './swedish.js';

const REGION = 'SE';

export async function syncSwedishHolidayCalendar(
  fromYear: number,
  toYear: number,
): Promise<{ holidayCount: number; aftonCount: number }> {
  const { holidays, aftons } = swedishHolidaysForYears(fromYear, toYear);

  await db.transaction(async (tx) => {
    for (const h of holidays) {
      await tx
        .insert(publicHolidays)
        .values({ holidayDate: h.date, name: h.name, region: REGION })
        .onConflictDoNothing();
    }

    // Aftnar är handels-specifika i MVP - ersätt SE-listan för synkade år
    await tx.delete(publicDayBeforeHolidays).where(eq(publicDayBeforeHolidays.region, REGION));

    for (const a of aftons) {
      await tx.insert(publicDayBeforeHolidays).values({
        dayBeforeHolidayDate: a.date,
        name: a.name,
        region: REGION,
      });
    }
  });

  return { holidayCount: holidays.length, aftonCount: aftons.length };
}
