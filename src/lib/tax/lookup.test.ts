import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { taxForGrossFromBrackets } from './lookup.js';
import { estimatedShiftNetOre } from './marginal.js';
import { OPEN_ENDED_INCOME_TO_ORE, parseSkattetabellCsv } from './parse-csv.js';
import type { TaxBracket } from './types.js';

const fixture: TaxBracket[] = [
  {
    year: 2026,
    dayType: '30B',
    tableNumber: 33,
    incomeFromOre: 1_00,
    incomeToOre: 15_000_00,
    taxIsPercent: false,
    taxCol1: 2_000_00,
    taxCol2: 0,
    taxCol3: 0,
    taxCol4: 0,
    taxCol5: 0,
    taxCol6: 0,
  },
  {
    year: 2026,
    dayType: '30B',
    tableNumber: 33,
    // Som CSV: nästa band börjar 15001 kr → 99 öre-hål om man matchar rått i öre
    incomeFromOre: 15_001_00,
    incomeToOre: 17_000_00,
    taxIsPercent: false,
    taxCol1: 2_500_00,
    taxCol2: 0,
    taxCol3: 0,
    taxCol4: 0,
    taxCol5: 0,
    taxCol6: 0,
  },
  {
    year: 2026,
    dayType: '30%',
    tableNumber: 33,
    incomeFromOre: 80_001_00,
    incomeToOre: 2_147_483_647,
    taxIsPercent: true,
    taxCol1: 35,
    taxCol2: 0,
    taxCol3: 0,
    taxCol4: 0,
    taxCol5: 0,
    taxCol6: 0,
  },
];

describe('tax lookup', () => {
  it('gross 0 -> skatt 0', () => {
    const r = taxForGrossFromBrackets(fixture, {
      year: 2026,
      tableNumber: 33,
      column: 1,
      grossOre: 0,
    });
    assert.equal(r.taxOre, 0);
  });

  it('15000kr -> skatt från första bracket', () => {
    const r = taxForGrossFromBrackets(fixture, {
      year: 2026,
      tableNumber: 33,
      column: 1,
      grossOre: 15_000_00,
    });
    assert.equal(r.taxOre, 2_000_00);
  });

  it('17000 kr -> skatt från andra bracket', () => {
    const r = taxForGrossFromBrackets(fixture, {
      year: 2026,
      tableNumber: 33,
      column: 1,
      grossOre: 17_000_00,
    });
    assert.equal(r.taxOre, 2_500_00);
  });

  it('över 30B faller tillbaka till 30% (procent av brutto)', () => {
    const r = taxForGrossFromBrackets(fixture, {
      year: 2026,
      tableNumber: 33,
      column: 1,
      grossOre: 100_000_00,
    });
    assert.equal(r.taxIsPercent, true);
    assert.equal(r.taxOre, 35_000_00);
  });

  it('15000.50 kr (öre-hål mellan band) → första bracket via hela kronor', () => {
    const r = taxForGrossFromBrackets(fixture, {
      year: 2026,
      tableNumber: 33,
      column: 1,
      grossOre: 15_000_50,
    });
    assert.equal(r.taxOre, 2_000_00);
    assert.equal(r.incomeToOre, 15_000_00);
  });
});

describe('parse open-ended 30%', () => {
  it('tom Inkomst t.o.m. blir öppet intervall', () => {
    const csv = [
      'År;Antal dgr;Tabellnr;Inkomst fr.o.m.;Inkomst t.o.m.;Kolumn 1;Kolumn 2;Kolumn 3;Kolumn 4;Kolumn 5;Kolumn 6;Kolumn 7',
      '2026;30%;33;1243001;;48;48;48;41;48;48;',
    ].join('\n');
    const rows = parseSkattetabellCsv(csv);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.incomeFromOre, 1_243_001_00);
    assert.equal(rows[0]!.incomeToOre, OPEN_ENDED_INCOME_TO_ORE);
    assert.equal(rows[0]!.taxIsPercent, true);
    assert.equal(rows[0]!.taxCol1, 48);
  });
});

describe('marginal shift net', () => {
  it('delta 15k-17k ger pass-netto = 2000 - (2500-2000) = 1500 kr', () => {
    const r = estimatedShiftNetOre({
      brackets: fixture,
      year: 2026,
      tableNumber: 33,
      column: 1,
      grossBeforeOre: 15_000_00,
      shiftGrossOre: 2_000_00,
    });
    assert.equal(r.taxBeforeOre, 2_000_00);
    assert.equal(r.taxAfterOre, 2_500_00);
    assert.equal(r.taxDeltaOre, 500_00);
    assert.equal(r.estimatedNetOre, 1_500_00);
  });
});
