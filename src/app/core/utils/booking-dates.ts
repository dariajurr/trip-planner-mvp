export interface FoundDate {
  index: number;
  length: number;
  /** YYYY-MM-DD */
  date: string;
  hasYear: boolean;
  /** Numeric d/m vs m/d could not be told apart. */
  ambiguous: boolean;
}

export interface FoundTime {
  index: number;
  length: number;
  /** HH:MM */
  time: string;
}

const MONTHS: Record<string, number> = {
  // English
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  // German
  januar: 1, jänner: 1, jän: 1, februar: 2, mär: 3, märz: 3, maerz: 3, mai: 5, juni: 6, juli: 7, okt: 10, oktober: 10, dez: 12, dezember: 12,
  // Russian
  янв: 1, января: 1, январь: 1, фев: 2, февр: 2, февраля: 2, февраль: 2, марта: 3, март: 3, апр: 4, апреля: 4, апрель: 4,
  мая: 5, май: 5, июн: 6, июня: 6, июнь: 6, июл: 7, июля: 7, июль: 7, авг: 8, августа: 8, август: 8,
  сен: 9, сент: 9, сентября: 9, сентябрь: 9, окт_: 10, октября: 10, октябрь: 10, ноя: 11, нояб: 11, ноября: 11, ноябрь: 11,
  дек: 12, декабря: 12, декабрь: 12,
};

const MONTH_RE = Object.keys(MONTHS)
  .filter(k => !k.endsWith('_'))
  .sort((a, b) => b.length - a.length)
  .join('|');

const pad = (n: number) => String(n).padStart(2, '0');
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function make(y: number, m: number, d: number): string | null {
  return m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m) ? `${y}-${pad(m)}-${pad(d)}` : null;
}

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, sonntag: 0, воскресенье: 0, mon: 1, monday: 1, montag: 1, понедельник: 1, tue: 2, tues: 2, tuesday: 2, dienstag: 2, вторник: 2,
  wed: 3, wednesday: 3, mittwoch: 3, среда: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, donnerstag: 4, четверг: 4, fri: 5, friday: 5, freitag: 5, пятница: 5,
  sat: 6, saturday: 6, samstag: 6, суббота: 6,
};
const WEEKDAY_RE = new RegExp(`(?<![\\p{L}])(${Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|')})(?![\\p{L}])`, 'iu');

/**
 * A date without a year but with a weekday ("1 December, Tuesday"): the weekday tells the year.
 * Returns the date to use and whether the weekday confirmed it.
 */
function yearFromWeekday(text: string, start: number, end: number, month: number, day: number, fallbackYear: number): { year: number; confirmed: boolean } {
  const around = `${text.slice(Math.max(0, start - 14), start)} ${text.slice(end, end + 14)}`;
  const m = WEEKDAY_RE.exec(around);
  if (!m) return { year: fallbackYear, confirmed: false };
  const wanted = WEEKDAYS[m[1].toLowerCase()];
  for (const year of [fallbackYear, fallbackYear + 1, fallbackYear - 1]) {
    if (daysIn(year, month) >= day && new Date(Date.UTC(year, month - 1, day)).getUTCDay() === wanted) return { year, confirmed: true };
  }
  return { year: fallbackYear, confirmed: false };
}

interface Pattern {
  re: RegExp;
  read: (m: RegExpExecArray, defaultYear: number) => { date: string | null; hasYear: boolean; ambiguous: boolean };
}

const PATTERNS: Pattern[] = [
  // 2026-12-12
  { re: /(?<![\d.\/-])(20\d{2})-(\d{2})-(\d{2})(?!\d)/g, read: m => ({ date: make(+m[1], +m[2], +m[3]), hasYear: true, ambiguous: false }) },
  // 2026/12/12, 2026.12.12
  { re: /(?<![\d.\/-])(20\d{2})[./](\d{1,2})[./](\d{1,2})(?!\d)/g, read: m => ({ date: make(+m[1], +m[2], +m[3]), hasYear: true, ambiguous: false }) },
  // 2026年12月12日
  { re: /(20\d{2})\s?年\s?(\d{1,2})\s?月\s?(\d{1,2})\s?日/g, read: m => ({ date: make(+m[1], +m[2], +m[3]), hasYear: true, ambiguous: false }) },
  // 12.12.2026, 12/12/26
  {
    re: /(?<![\d.\/-])(\d{1,2})[./](\d{1,2})[./](20\d{2}|\d{2})(?![\d])/g,
    read: m => {
      const a = +m[1];
      const b = +m[2];
      const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      if (a > 12) return { date: make(y, b, a), hasYear: true, ambiguous: false };
      if (b > 12) return { date: make(y, a, b), hasYear: true, ambiguous: false }; // US order
      return { date: make(y, b, a), hasYear: true, ambiguous: a !== b };
    },
  },
  // 12 Dec 2026, 12. Dezember 2026, 12th of December, 12 декабря 2026 г.
  {
    re: new RegExp(`(?<![\\d.\\/])(\\d{1,2})(?:st|nd|rd|th)?\\.?\\s*(?:of\\s+)?(${MONTH_RE})(?![\\p{L}])\\.?,?\\s*(?:(20\\d{2})(?!\\d))?`, 'giu'),
    read: (m, y) => ({ date: make(m[3] ? +m[3] : y, MONTHS[m[2].toLowerCase()], +m[1]), hasYear: !!m[3], ambiguous: false }),
  },
  // Dec 12, 2026 / December 12th
  {
    re: new RegExp(`(?<![\\p{L}])(${MONTH_RE})\\.?\\s+(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2})(?!\\d))?`, 'giu'),
    read: (m, y) => ({ date: make(m[3] ? +m[3] : y, MONTHS[m[1].toLowerCase()], +m[2]), hasYear: !!m[3], ambiguous: false }),
  },
];

/** All dates in the text, in order. Year-less dates use defaultYear. */
export function findDates(text: string, defaultYear: number): FoundDate[] {
  const found: FoundDate[] = [];

  for (const { re, read } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      let r = read(m, defaultYear);
      if (r.date && !r.hasYear) {
        const [, mo, d] = r.date.split('-').map(Number);
        const length = m[0].trimEnd().length;
        const guess = yearFromWeekday(text, m.index, m.index + length, mo, d, defaultYear);
        if (guess.confirmed) r = { ...r, date: make(guess.year, mo, d), hasYear: true };
      }
      if (r.date) found.push({ index: m.index, length: m[0].trimEnd().length, ...r, date: r.date });
    }
  }

  // drop dates overlapping an earlier/longer one
  found.sort((a, b) => a.index - b.index || b.length - a.length);
  const out: FoundDate[] = [];
  for (const d of found) {
    const last = out[out.length - 1];
    if (!last || d.index >= last.index + last.length) out.push(d);
  }
  return out;
}

/** All clock times in the text, in order, as 24 hour HH:MM. */
export function findTimes(text: string): FoundTime[] {
  const found: FoundTime[] = [];
  const taken: [number, number][] = [];
  const overlaps = (i: number, l: number) => taken.some(([s, e]) => i < e && i + l > s);

  const twelve = /(?<![\d:.])(\d{1,2}):(\d{2})\s?([AaPp])\.?[Mm]\.?/g;
  let m: RegExpExecArray | null;
  while ((m = twelve.exec(text))) {
    let h = +m[1];
    const pm = m[3].toLowerCase() === 'p';
    if (h < 1 || h > 12 || +m[2] > 59) continue;
    h = (h % 12) + (pm ? 12 : 0);
    found.push({ index: m.index, length: m[0].length, time: `${pad(h)}:${m[2]}` });
    taken.push([m.index, m.index + m[0].length]);
  }

  const h24 = /(?<![\d:.])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/g;
  while ((m = h24.exec(text))) {
    if (overlaps(m.index, m[0].length)) continue;
    found.push({ index: m.index, length: m[0].length, time: `${pad(+m[1])}:${m[2]}` });
    taken.push([m.index, m.index + m[0].length]);
  }

  const uhr = /(?<![\d:.])([01]?\d|2[0-3])\s?Uhr(?![\p{L}])/giu;
  while ((m = uhr.exec(text))) {
    if (overlaps(m.index, m[0].length)) continue;
    found.push({ index: m.index, length: m[0].length, time: `${pad(+m[1])}:00` });
  }

  return found.sort((a, b) => a.index - b.index);
}

export function addDay(iso: string, days = 1): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
