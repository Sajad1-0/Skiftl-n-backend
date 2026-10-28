import { AppError } from '../middleware/error.middleware.js';

export interface BreakInterval {
  startAt: Date;
  endAt: Date;
}

export interface StoredBreakIntervals {
  startAt: string; // ISO
  endAt: string;
}

export function intervalMinutes(interval: BreakInterval): number {
  return Math.floor((interval.endAt.getTime() - interval.startAt.getTime()) / 60_000);
}

export function totalBreakMinutes(intervals: BreakInterval[]): number {
  return intervals.reduce((sum, i) => sum + intervalMinutes(i), 0);
}

export function toStoredBreakIntervals(intervals: BreakInterval[]): StoredBreakIntervals[] {
  return intervals.map((i) => ({
    startAt: i.startAt.toISOString(),
    endAt: i.endAt.toISOString(),
  }));
}

export function parsedStoredBreakIntervals(
  raw: StoredBreakIntervals[] | null | undefined,
): BreakInterval[] {
  if (!raw || raw.length === 0) return [];
  return raw.map((i) => ({
    startAt: new Date(i.startAt),
    endAt: new Date(i.endAt),
  }));
}

export function validateBreakIntervals(
  shiftStart: Date,
  shiftEnd: Date,
  intervals: BreakInterval[],
): void {
  if (intervals.length === 0) return;

  const sorted = [...intervals].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]!;

    if (!(cur.endAt.getTime() > cur.startAt.getTime())) {
      throw new AppError(400, 'Rastintervall: slut måste vara efter start');
    }
    if (cur.startAt.getTime() < shiftStart.getTime() || cur.endAt.getTime() > shiftEnd.getTime()) {
      throw new AppError(400, 'Rastintervall måste ligga inom passets start och slut.');
    }

    if (i > 0) {
      const prev = sorted[i - 1]!;
      if (cur.startAt.getTime() < prev.endAt.getTime()) {
        throw new AppError(400, 'Rastintervall får inte överlappa');
      }
    }
  }
}
