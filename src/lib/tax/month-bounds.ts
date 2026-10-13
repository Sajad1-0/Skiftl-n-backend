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
