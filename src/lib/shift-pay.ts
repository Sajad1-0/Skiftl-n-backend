import { AppError } from '../middleware/error.middleware.js';

/** Om `to` är midnatt UTC (t.ex. date-only), inkludera hela dagen. */
export function inclusiveEndBound(date: Date): Date {
  const isMidnight =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;

  if (!isMidnight) return date;

  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

export function calcWorkedMinutes(startAt: Date, endAt: Date, breakMinutes: number): number {
  const total = Math.floor((endAt.getTime() - startAt.getTime()) / 60_000);
  const worked = total - breakMinutes;

  if (worked <= 0) {
    throw new AppError(400, 'Rast får inte vara lika lång eller längre än passet');
  }

  return worked;
}

// Timlön i öre -> brutto i öre.
export function calcGrossOre(workedMinutes: number, hourlyWagesOre: number): number {
  return Math.round((workedMinutes / 60) * hourlyWagesOre);
}

/**
 * taxRate: 0–100 (t.ex. 30 = 30 %).
 * Netto = brutto × (1 − skatt/100), avrundat till öre.
 */
export function calcNetOre(grossOre: number, taxRatePercent: number): number {
  const rate = Math.min(100, Math.max(0, taxRatePercent));
  return Math.round(grossOre * (1 - rate / 100));
}

export function parseTaxRate(taxRate: string | number): number {
  const n = typeof taxRate === 'number' ? taxRate : Number(taxRate);
  if (!Number.isFinite(n)) {
    throw new AppError(500, 'Ogiltig skattesats i jobbprofil');
  }

  return n;
}
