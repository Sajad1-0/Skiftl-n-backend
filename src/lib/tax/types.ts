export type TaxDayType = '30B' | '30%';

export type TaxColumn = 1 | 2 | 3 | 4 | 5 | 6;

export interface TaxBracket {
  year: number;
  dayType: TaxDayType;
  tableNumber: number;
  incomeFromOre: number;
  incomeToOre: number;
  taxIsPercent: boolean;
  taxCol1: number;
  taxCol2: number;
  taxCol3: number;
  taxCol4: number;
  taxCol5: number;
  taxCol6: number;
}

export interface TaxLookupInput {
  year: number;
  tableNumber: number;
  column: TaxColumn;
  // Månadsbrutto i öre
  grossOre: number;
  // Default 30B - ordinär månadstabell
  dayType?: TaxDayType | undefined;
}

export interface TaxLookupResult {
  taxOre: number;
  incomeFromOre: number;
  incomeToOre: number;
  taxIsPercent: boolean;
}
