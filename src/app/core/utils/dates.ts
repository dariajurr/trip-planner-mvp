const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date of the device as YYYY-MM-DD (not UTC). */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T12:00:00Z`) - Date.parse(`${fromIso}T12:00:00Z`)) / 86_400_000);
}

/** Same month and day, N years earlier. Returns a date that may not exist (29 Feb); callers just fail to find it. */
export function shiftYears(iso: string, years: number): string {
  return `${Number(iso.slice(0, 4)) + years}${iso.slice(4)}`;
}

const dayFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
const shortFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });

export const formatDay = (iso: string) => dayFormat.format(new Date(`${iso}T12:00:00`));
export const formatShort = (iso: string) => shortFormat.format(new Date(`${iso}T12:00:00`));

/** "сегодня", "завтра", "через 5 дн.", "3 дн. назад". */
export function relativeDay(iso: string, today: string): string {
  const diff = daysBetween(today, iso);
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'завтра';
  if (diff === -1) return 'вчера';
  return diff > 0 ? `через ${diff} дн.` : `${-diff} дн. назад`;
}
