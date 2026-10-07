import { readFileSync } from 'node:fs';

import type { TaxBracket, TaxDayType } from './types.js';

/** Tom "Inkomst t.o.m." = öppet intervall uppåt (max Postgres integer). */
export const OPEN_ENDED_INCOME_TO_ORE = 2_147_483_647;

function kronorToOre(kronor: number): number {
  return Math.round(kronor * 100);
}

function parseIntOrZero(raw: string): number {
  const t = raw.trim();
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parsar Skatteverkets semikolon-CSV (latin1).
 * Hoppar över rader utan giltigt from-belopp.
 * Tom to-kolumn → öppet intervall (högsta 30%-raden per tabell).
 */
export function parseSkattetabellCsv(csvText: string): TaxBracket[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const brackets: TaxBracket[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(';');
    if (cols.length < 11) continue;

    const year = parseIntOrZero(cols[0]!);
    const dayTypeRaw = cols[1]!.trim();
    const tableNumber = parseIntOrZero(cols[2]!);
    const fromKr = parseIntOrZero(cols[3]!);
    const toRaw = cols[4]!.trim();
    const openEnded = toRaw.length === 0;
    const toKr = openEnded ? 0 : parseIntOrZero(toRaw);

    if (!year || !tableNumber || fromKr <= 0) continue;
    if (!openEnded && (toKr <= 0 || toKr < fromKr)) continue;
    if (dayTypeRaw !== '30B' && dayTypeRaw !== '30%') continue;

    const dayType = dayTypeRaw as TaxDayType;
    const taxIsPercent = dayType === '30%';

    const c1 = parseIntOrZero(cols[5]!);
    const c2 = parseIntOrZero(cols[6]!);
    const c3 = parseIntOrZero(cols[7]!);
    const c4 = parseIntOrZero(cols[8]!);
    const c5 = parseIntOrZero(cols[9]!);
    const c6 = parseIntOrZero(cols[10]!);

    brackets.push({
      year,
      dayType,
      tableNumber,
      incomeFromOre: kronorToOre(fromKr),
      incomeToOre: openEnded ? OPEN_ENDED_INCOME_TO_ORE : kronorToOre(toKr),
      taxIsPercent,
      // 30B: kronor → öre. 30%: procent lämnas som heltal (t.ex. 30).
      taxCol1: taxIsPercent ? c1 : kronorToOre(c1),
      taxCol2: taxIsPercent ? c2 : kronorToOre(c2),
      taxCol3: taxIsPercent ? c3 : kronorToOre(c3),
      taxCol4: taxIsPercent ? c4 : kronorToOre(c4),
      taxCol5: taxIsPercent ? c5 : kronorToOre(c5),
      taxCol6: taxIsPercent ? c6 : kronorToOre(c6),
    });
  }

  return brackets;
}

export function loadSkattetabellCsvFile(absolutePath: string): TaxBracket[] {
  const text = readFileSync(absolutePath, { encoding: 'latin1' });
  return parseSkattetabellCsv(text);
}
