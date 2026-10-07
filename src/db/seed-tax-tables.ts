import 'dotenv/config';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';

import { loadSkattetabellCsvFile } from '../lib/tax/parse-csv.js';
import { db } from './index.js';
import { taxTableBrackets } from './schema.js';

function assertSeedAllowed(): void {
  if (process.env.NODE_ENV === 'production' && process.env.CONFIRM_SEED !== '1') {
    throw new Error('Vägrar seed i production utan CONFIRM_SEED=1');
  }
}

async function main() {
  assertSeedAllowed();

  const year = Number(process.argv[2] ?? 2026);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error('Användning: pnpm db:seed:tax-tables [year]');
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const csvPath = path.resolve(here, `../../data/skattetabell-manadslon-${year}.csv`);

  const parsed = loadSkattetabellCsvFile(csvPath);
  const brackets = parsed.filter((b) => b.year === year);
  if (brackets.length === 0) {
    throw new Error(`Inga rader för year=${year} i ${csvPath}`);
  }

  await db.transaction(async (tx) => {
    await tx.delete(taxTableBrackets).where(eq(taxTableBrackets.year, year));

    const chunkSize = 500;
    for (let i = 0; i < brackets.length; i += chunkSize) {
      const chunk = brackets.slice(i, i + chunkSize);
      await tx.insert(taxTableBrackets).values(
        chunk.map((b) => ({
          year: b.year,
          dayType: b.dayType,
          tableNumber: b.tableNumber,
          incomeFromOre: b.incomeFromOre,
          incomeToOre: b.incomeToOre,
          taxIsPercent: b.taxIsPercent,
          taxCol1: b.taxCol1,
          taxCol2: b.taxCol2,
          taxCol3: b.taxCol3,
          taxCol4: b.taxCol4,
          taxCol5: b.taxCol5,
          taxCol6: b.taxCol6,
        })),
      );
    }
  });

  console.log(`Skattetabell ${year}: ${brackets.length} brackets seedade från ${csvPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
