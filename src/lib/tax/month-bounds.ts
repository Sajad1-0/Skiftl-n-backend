export const PREMIUM_HISTORY_MONTHS = 6;

export interface YearMonth {
  year: number;
  month: number; // 1-12
}

function monthIndex(ym: YearMonth): number {
  return ym.year * 12 + ym.month;
}

// Nuvarande + föregående (count-1) Stockholm-månader, nyast först.
export function listSelectableStockholmMonths(
  now: Date = new Date(),
  count: number = PREMIUM_HISTORY_MONTHS,
): YearMonth[] {
  const { year, month } = stockholmYearMonth(now);
  const out: YearMonth[] = [];

  let y = year;
  let m = month;
  for (let i = 0; i < count; i++) {
    out.push({ year: y, month: m });
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

/** true om date ligger i en av de senaste `count` Stockholm-månaderna (inkl. nu). */
export function isWithinRecentStockholmMonths(
  date: Date,
  now: Date = new Date(),
  count: number = PREMIUM_HISTORY_MONTHS,
): boolean {
  const d = stockholmYearMonth(date);
  const n = stockholmYearMonth(now);
  const diff = monthIndex(n) - monthIndex(d);
  return diff >= 0 && diff < count;
}

export function yearMonthKey(ym: YearMonth): string {
  return `${ym.year}-${String(ym.month).padStart(2, '0')}`;
}

export function stockholmYearMonth(date: Date): { year: number; month: number } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: 'numeric',
  });
  const parts = fmt.formatToParts(date);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  if (!year || !month) throw new Error('Kunde inte läsa Stockholm-månad');
  return { year, month };
}

/** Ungefärliga UTC-gränser som täcker hela Stockholm-månaden (generöst ±1 dag). */
export function stockholmMonthQueryRange(date: Date): { from: Date; to: Date } {
  const { year, month } = stockholmYearMonth(date);

  // Lokal midnatt Stockholm ≈ UTC−1/UTC−2; ta bredd så filter inte missar pass
  const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  from.setUTCHours(from.getUTCHours() - 2);
  const to = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  to.setUTCHours(to.getUTCHours() + 26);

  return { from, to };
}

export function sameStockholmMonth(a: Date, b: Date): boolean {
  const x = stockholmYearMonth(a);
  const y = stockholmYearMonth(b);
  return x.year === y.year && x.month === y.month;
}
