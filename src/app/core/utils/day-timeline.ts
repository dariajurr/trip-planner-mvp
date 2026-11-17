export type PartOfDay = 'morning' | 'day' | 'evening';

export const PART_LABEL: Record<PartOfDay, string> = { morning: 'утро', day: 'день', evening: 'вечер' };

export function partOfDay(minutes: number): PartOfDay {
  return minutes < 12 * 60 ? 'morning' : minutes < 17 * 60 ? 'day' : 'evening';
}

export function formatClock(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function parseClock(text: string | undefined, fallback: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
}

/** A rough time between two stops when the route does not say: on foot when close, otherwise by train. */
export function estimateTravelMin(km: number): number {
  if (km < 1.2) return Math.max(5, Math.ceil(((km / 4.5) * 60) / 5) * 5);
  return Math.ceil((10 + (km / 22) * 60) / 5) * 5;
}

export interface TimelineItem {
  durationMin: number;
  /** Time to the next stop (not used after the last one). */
  travelToNextMin: number;
}

export interface TimelineSlot {
  start: number;
  end: number;
  part: PartOfDay;
  /** The part of the day is announced only when it changes. */
  announce: boolean;
}

/** Start and end of every stop, one after another, beginning at `startMin`. */
export function layoutDay(items: TimelineItem[], startMin: number): TimelineSlot[] {
  const slots: TimelineSlot[] = [];
  let at = startMin;
  let previous: PartOfDay | null = null;
  items.forEach((item, i) => {
    const part = partOfDay(at);
    slots.push({ start: at, end: at + item.durationMin, part, announce: part !== previous });
    previous = part;
    at += item.durationMin + (i < items.length - 1 ? item.travelToNextMin : 0);
  });
  return slots;
}

export interface DaySegment {
  cityId: string;
  from: string;
  to: string;
  days: number;
}

/** Consecutive days in the same city make one segment ("Tokyo 2-5 Dec", "Kamakura 6 Dec"). */
export function segmentDays(days: { date: string; cityId: string | undefined }[]): DaySegment[] {
  const out: DaySegment[] = [];
  for (const d of days) {
    if (!d.cityId) continue;
    const last = out[out.length - 1];
    if (last && last.cityId === d.cityId) {
      last.to = d.date;
      last.days++;
    } else {
      out.push({ cityId: d.cityId, from: d.date, to: d.date, days: 1 });
    }
  }
  return out;
}
