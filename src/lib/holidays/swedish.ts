export interface CalendarDay {
  date: string; // YYYY-MM-DD
  name: string;
}

// Påskdagen (Gregorian / Meeus/Jones/Butcher).
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=mar, 4=apr
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysUtc(d: Date, days: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

/** Första lördagen i [start, end] inklusive (UTC-datum). */
function firstSaturdayOnOrAfter(year: number, monthIndex: number, day: number): Date {
  const d = new Date(Date.UTC(year, monthIndex, day));
  const dow = d.getUTCDay(); // 0=söndag 6=lördag
  const delta = (6 - dow + 7) % 7;
  return addDaysUtc(d, delta);
}

/**
 * Svenska allmänna helgdagar (röda dagar) för OB.
 * Inkluderar inte julafton/nyårsafton/midsommarafton (de är aftnar, inte helgdagar).
 */
export function swedishPublicHolidays(year: number): CalendarDay[] {
  const easter = easterSunday(year);
  const midsummerDay = firstSaturdayOnOrAfter(year, 5, 20); // 20–26 juni
  const allSaints = firstSaturdayOnOrAfter(year, 9, 31); // 31 okt – 6 nov

  return [
    { date: `${year}-01-01`, name: 'Nyårsdag' },
    { date: `${year}-01-06`, name: 'Trettondedag jul' },
    { date: ymd(addDaysUtc(easter, -2)), name: 'Långfredagen' },
    { date: ymd(easter), name: 'Påskdagen' },
    { date: ymd(addDaysUtc(easter, 1)), name: 'Annandag påsk' },
    { date: `${year}-05-01`, name: 'Första maj' },
    { date: ymd(addDaysUtc(easter, 39)), name: 'Kristi himmelsfärdsdag' },
    { date: `${year}-06-06`, name: 'Nationaldagen' },
    // Pingstdagen är röd dag men ofta utan särskild OB utöver söndag —
    // behåll för helgdagslistan (100 % enligt § 8.1 "helgdagar")
    { date: ymd(addDaysUtc(easter, 49)), name: 'Pingstdagen' },
    { date: ymd(midsummerDay), name: 'Midsommardagen' },
    { date: ymd(allSaints), name: 'Alla helgons dag' },
    { date: `${year}-12-25`, name: 'Juldagen' },
    { date: `${year}-12-26`, name: 'Annandag jul' },
  ];
}

/**
 * Handels § 8.1: aftnar som jämställs med lördag.
 * Bara jul-, nyårs- och midsommarafton.
 */

export function handelsAftonDays(year: number): CalendarDay[] {
  const midsummerDay = firstSaturdayOnOrAfter(year, 5, 20);
  const midsummerEve = addDaysUtc(midsummerDay, -1);

  return [
    { date: ymd(midsummerEve), name: 'Midsommarafton' },
    { date: `${year}-12-24`, name: 'Julafton' },
    { date: `${year}-12-31`, name: 'Nyårsafton' },
  ];
}

export function swedishHolidaysForYears(
  fromYear: number,
  toYear: number,
): {
  holidays: CalendarDay[];
  aftons: CalendarDay[];
} {
  if (toYear < fromYear) throw new Error('toYear måste vara >= fromYear');

  const holidays: CalendarDay[] = [];
  const aftons: CalendarDay[] = [];

  for (let y = fromYear; y <= toYear; y += 1) {
    holidays.push(...swedishPublicHolidays(y));
    aftons.push(...handelsAftonDays(y));
  }

  return { holidays, aftons };
}
