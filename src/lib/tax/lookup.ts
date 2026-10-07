import type { TaxBracket, TaxColumn, TaxLookupInput, TaxLookupResult } from './types.js';

function columnTax(bracket: TaxBracket, column: TaxColumn): number {
  switch (column) {
    case 1:
      return bracket.taxCol1;
    case 2:
      return bracket.taxCol2;
    case 3:
      return bracket.taxCol3;
    case 4:
      return bracket.taxCol4;
    case 5:
      return bracket.taxCol5;
    case 6:
      return bracket.taxCol6;
    default: {
      const _exhaustive: never = column;
      return _exhaustive;
    }
  }
}

/** Skatteverket-band är hela kronor; undvik 99-öre-hål mellan seedade intervall. */
function oreToWholeKronor(ore: number): number {
  return Math.floor(ore / 100);
}

function bracketContainsGross(bracket: TaxBracket, grossOre: number): boolean {
  const grossKr = oreToWholeKronor(grossOre);
  const fromKr = oreToWholeKronor(bracket.incomeFromOre);
  const toKr = oreToWholeKronor(bracket.incomeToOre);
  return grossKr >= fromKr && grossKr <= toKr;
}

/**
 * Hitta bracket för grossOre bland redan filtrerade rader (samma year/table/dayType).
 * grossOre = 0 → skatt 0 (inga pass ännu).
 * Matchar på hela kronor (CSV-gränser), så belopp som 2100,50 kr inte faller mellan band.
 */
export function taxForGrossFromBrackets(
  brackets: TaxBracket[],
  input: TaxLookupInput,
): TaxLookupResult {
  const { year, tableNumber, column, grossOre, dayType = '30B' } = input;

  if (grossOre < 0) throw new Error('grossOre får inte vara negativ');

  if (grossOre === 0) {
    return { taxOre: 0, incomeFromOre: 0, incomeToOre: 0, taxIsPercent: false };
  }

  const matching = brackets.filter(
    (b) =>
      b.year === year &&
      b.tableNumber === tableNumber &&
      b.dayType === dayType &&
      bracketContainsGross(b, grossOre),
  );

  if (matching.length === 0) {
    // 30B tar slut ~80k kr — fortsätt med 30%-rader (procent av brutto)
    if (dayType === '30B') {
      return taxForGrossFromBrackets(brackets, { ...input, dayType: '30%' });
    }
    throw new Error(
      `Ingen skattetabell för year=${year} table=${tableNumber} dayType=${dayType} grossOre=${grossOre}`,
    );
  }

  // Om flera (bör inte hända): ta snävaste intervall
  matching.sort((a, b) => a.incomeToOre - a.incomeFromOre - (b.incomeToOre - b.incomeFromOre));
  const bracket = matching[0]!;
  const raw = columnTax(bracket, column);

  const taxOre = bracket.taxIsPercent ? Math.round((grossOre * raw) / 100) : raw;

  return {
    taxOre,
    incomeFromOre: bracket.incomeFromOre,
    incomeToOre: bracket.incomeToOre,
    taxIsPercent: bracket.taxIsPercent,
  };
}

export function taxOreForColumn(result: TaxLookupResult): number {
  return result.taxOre;
}
