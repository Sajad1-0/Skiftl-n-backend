export type DayKind = 'weekday' | 'saturday' | 'sunday' | 'holiday' | 'dayBeforeHoliday' | 'all';

export interface ObRuleInput {
  dayKind: DayKind;
  // "HH:mm:ss" eller "HH:mm"
  startTime: string;
  endTime: string;
  obPercent: number;
  priority: number;
  label?: string | null;
}

export interface ObSegment {
  startAt: string; // ISO
  endAt: string;
  minutes: number;
  obPercent: number;
  dayKind: DayKind;
  baseOre: number;
  obOre: number;
}

export interface ObPayResult {
  workedMinutes: number;
  baseOre: number;
  obOre: number;
  grossOre: number;
  segments: ObSegment[];
}
