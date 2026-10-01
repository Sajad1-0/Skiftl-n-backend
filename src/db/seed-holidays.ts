import 'dotenv/config';
import { syncSwedishHolidayCalendar } from '../lib/holidays/sync.js';

function assertSeedAllowed(): void {
  if (process.env.NODE_ENV === 'production' && process.env.CONFIRM_SEED !== '1') {
    throw new Error('Vägrar seed i production utan CONFIRM_SEED=1');
  }
}

async function main() {
  assertSeedAllowed();

  const fromYear = Number(process.argv[2] ?? new Date().getFullYear() - 1);
  const toYear = Number(process.argv[3] ?? fromYear + 3);

  if (!Number.isInteger(fromYear) || !Number.isInteger(toYear)) {
    throw new Error('Användning: pnpm db:seed:holidays [fromYear] [toYear]');
  }

  const result = await syncSwedishHolidayCalendar(fromYear, toYear);
  console.log(
    `Helgkalender synkad SE ${fromYear}–${toYear}: ${result.holidayCount} helgdagar, ${result.aftonCount} aftnar`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
