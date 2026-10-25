import { AIRLINES, AIRPORTS } from '../data/airports';
import { FoundDate, FoundTime, addDay, findDates, findTimes } from './booking-dates';

/** Editable drafts: every field is a plain string so forms can bind to it. Empty string = not found. */
export interface FlightDraft {
  kind: 'flight';
  flightNumber: string;
  airline: string;
  from: string;
  to: string;
  depDate: string;
  depTime: string;
  arrDate: string;
  arrTime: string;
  confirmation: string;
  warnings: string[];
}

export interface HotelDraft {
  kind: 'hotel';
  name: string;
  address: string;
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
  confirmation: string;
  /** Chosen by the user in the review form, never guessed by the parser. */
  cityId?: string;
  warnings: string[];
}

export type BookingDraft = FlightDraft | HotelDraft;

export interface ParseOptions {
  /** Used when a date has no year. */
  defaultYear: number;
}

export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00A0\u202F\u2009\u200B]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map(l => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---- shared helpers --------------------------------------------------------
const lineStart = (text: string, index: number) => text.lastIndexOf('\n', index - 1) + 1;

/** Start offset of the line that is `n` lines above the line containing `index`. */
function linesAbove(text: string, index: number, n: number): number {
  let pos = lineStart(text, index);
  for (let i = 0; i < n && pos > 0; i++) pos = lineStart(text, pos - 1);
  return pos;
}

const CONF_RE =
  /(?:confirmation\s*(?:number|no\.?|code)|booking\s*(?:reference|number|no\.?|code|id)|reservation\s*(?:number|code|no\.?)|reference\s*(?:number|code)|record\s*locator|PNR|buchungs(?:nummer|code)|reservierungs(?:nummer|code)|bestätigungs(?:nummer|code)|номер\s+(?:брони|бронирования|заказа)|код\s+бронирования)\s*[:：#]?\s*([A-Za-z0-9][A-Za-z0-9-]{4,17})/giu;

/** A booking reference looks like NLC7FZ or X7K2LM: 6 capitals/digits, not only digits. */
const PNR_TOKEN = /(?<![A-Za-z0-9])(?=[A-Z0-9]*[A-Z])[A-Z0-9]{6}(?![A-Za-z0-9])/;
const ORDER_RE = /order\s*(?:number|no\.?)[^:\n]{0,25}[:：]\s*([A-Z0-9][A-Z0-9-]{4,24})/i;

function findConfirmation(text: string, kind: 'flight' | 'hotel'): string {
  CONF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CONF_RE.exec(text))) {
    const token = m[1];
    if (token === token.toUpperCase() && /[0-9]|^[A-Z]{5,}$/.test(token)) return token;
  }

  if (kind === 'flight') {
    // tickets often print the reference under a "BOOKING REF" heading, next to the airline name
    const label = /booking\s*ref(?:erence)?[^\n]*\n([^\n]*)/i.exec(text);
    const token = label && PNR_TOKEN.exec(label[1]);
    if (token) return token[0];
  } else {
    const order = ORDER_RE.exec(text);
    if (order) return order[1];
  }
  return '';
}

const IGNORED_DATE_CONTEXT = /(booked|issued|ausgestellt|buchungsdatum|date of issue|valid until|expir|cancel|storn|gültig bis|дата выпуска|оформлен|действителен)[^\n]{0,30}$/i;
const IGNORED_TIME_CONTEXT = /(boarding|check-?in|gate|counter|closes|schließt|einsteigen|schalter|посадка|регистрация|закрыт)[^\n]{0,20}$/i;

function usableDates(text: string, opts: ParseOptions): FoundDate[] {
  return findDates(text, opts.defaultYear).filter(d => !IGNORED_DATE_CONTEXT.test(text.slice(Math.max(0, d.index - 45), d.index)));
}

function usableTimes(text: string): FoundTime[] {
  return findTimes(text).filter(t => !IGNORED_TIME_CONTEXT.test(text.slice(Math.max(0, t.index - 30), t.index)));
}

// ---- flights ---------------------------------------------------------------
const FLIGHT_RE = /(?<![A-Za-z0-9])([A-Z0-9]{2})\s?(\d{1,4})(?![A-Za-z0-9])/g;
const AMBIGUOUS_AIRPORTS = new Set(['CAN', 'MAN', 'SIN', 'DEL', 'BOS', 'ADD', 'SEA', 'MAD', 'MEL', 'ORD', 'TAS', 'ATH', 'DUB', 'LIS']);

interface AirportToken {
  index: number;
  code: string;
  /** Written as "(XXX)": certain even for codes that are also English words. */
  paren?: boolean;
}

function findAirports(text: string): AirportToken[] {
  const out: AirportToken[] = [];
  const paren = /\(([A-Z]{3})\)/g;
  let m: RegExpExecArray | null;
  while ((m = paren.exec(text))) out.push({ index: m.index, code: m[1], paren: true });

  const bare = /(?<![A-Za-z0-9(])([A-Z]{3})(?![A-Za-z0-9)])/g;
  while ((m = bare.exec(text))) {
    if (!AIRPORTS[m[1]]) continue;
    out.push({ index: m.index, code: m[1] });
  }
  out.sort((a, b) => a.index - b.index);
  return out;
}

interface FlightMatch {
  index: number;
  end: number;
  code: string;
  number: string;
}

function findFlightNumbers(text: string): FlightMatch[] {
  const out: FlightMatch[] = [];
  FLIGHT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FLIGHT_RE.exec(text))) {
    if (!AIRLINES[m[1]] || !/[A-Z]/.test(m[1])) continue;
    out.push({ index: m.index, end: m.index + m[0].length, code: m[1], number: String(+m[2]) });
  }
  return out;
}

/** The date written right next to a time ("23:15, 30 November 2026" or "12 Dec 2026 11:45"), on the same line. */
function dateNextTo(text: string, time: FoundTime | undefined, dates: FoundDate[], exclude?: FoundDate): FoundDate | undefined {
  if (!time) return undefined;
  const timeEnd = time.index + time.length;
  return dates
    .filter(d => d !== exclude)
    .map(d => {
      const gap = d.index >= timeEnd ? d.index - timeEnd : time.index - (d.index + d.length);
      const between = d.index >= timeEnd ? text.slice(timeEnd, d.index) : text.slice(d.index + d.length, time.index);
      return { d, gap, newline: between.includes('\n') };
    })
    .filter(x => x.gap >= 0 && x.gap <= 30 && !x.newline)
    .sort((a, b) => a.gap - b.gap)[0]?.d;
}

function parseFlights(text: string, opts: ParseOptions): FlightDraft[] {
  const matches = findFlightNumbers(text);
  if (!matches.length) return [];

  const allAirports = findAirports(text);
  const dates = usableDates(text, opts);
  const times = usableTimes(text);
  const confirmation = findConfirmation(text, 'flight');
  const drafts: FlightDraft[] = [];

  matches.forEach((match, i) => {
    const segStart = lineStart(text, match.index);
    const segEnd = i + 1 < matches.length ? lineStart(text, matches[i + 1].index) : Math.min(text.length, match.index + 900);
    // some documents put the date in a heading above the flight line
    const leftStart = linesAbove(text, match.index, 2);
    const inSeg = <T extends { index: number }>(list: T[]) => list.filter(t => t.index >= segStart && t.index < Math.max(segEnd, segStart + 1));

    const segTimes = inSeg(times);
    const segDates = inSeg(dates);
    let airports = inSeg(allAirports);
    if (!airports.length) airports = allAirports.filter(a => a.index >= leftStart && a.index < segStart);

    // ambiguous codes ("CAN", "MAN"...) only count next to another airport
    const sure = airports.filter(a => a.paren || !AMBIGUOUS_AIRPORTS.has(a.code));
    airports = sure.length ? airports : [];
    const codes = airports.map(a => a.code).filter((c, k, arr) => k === 0 || c !== arr[k - 1]);

    if (codes.length < 2 && !(codes.length === 1 && segTimes.length)) return;

    const warnings: string[] = [];
    const depTime = segTimes[0];
    const arrTime = segTimes[1];

    // departure date: first date before the first time in the segment, else the nearest heading above, else any
    const firstTimeAt = depTime ? depTime.index : Infinity;
    let depDate: FoundDate | undefined = dateNextTo(text, depTime, segDates) ?? segDates.find(d => d.index < firstTimeAt);
    if (!depDate) depDate = [...dates].reverse().find(d => d.index >= leftStart && d.index < segStart);
    if (!depDate) depDate = segDates[0];

    let arrDate = '';
    let arrDateKnown = false;
    const arrNear = dateNextTo(text, arrTime, segDates, depDate);
    if (arrNear) {
      arrDate = arrNear.date;
      arrDateKnown = true;
    } else if (arrTime && depTime) {
      const between = segDates.filter(d => d.index > depTime.index && d.index < arrTime.index && d !== depDate);
      if (between.length) {
        arrDate = between[between.length - 1].date;
        arrDateKnown = true;
      }
    }
    if (!arrDate && depDate && arrTime) {
      const after = text.slice(arrTime.index + arrTime.length, arrTime.index + arrTime.length + 14);
      const plusDay = /^\s?\(?\+\s?1/.test(after);
      if (plusDay || (depTime && arrTime.time < depTime.time)) {
        arrDate = addDay(depDate.date);
        if (!plusDay) warnings.push('Дата прилёта предположена: следующий день. Проверьте.');
      } else {
        arrDate = depDate.date;
      }
    }

    if (depDate && !depDate.hasYear) warnings.push(`В документе нет года, взят ${opts.defaultYear}.`);
    if (depDate?.ambiguous) warnings.push('Формат даты неоднозначен (день/месяц). Проверьте.');
    if (!depDate) warnings.push('Не найдена дата вылета.');
    if (!depTime) warnings.push('Не найдено время вылета.');
    if (codes.length < 2) warnings.push('Найден только один аэропорт.');
    void arrDateKnown;

    drafts.push({
      kind: 'flight',
      flightNumber: `${match.code} ${match.number}`,
      airline: AIRLINES[match.code] ?? '',
      from: codes[0] ?? '',
      to: codes[1] ?? '',
      depDate: depDate?.date ?? '',
      depTime: depTime?.time ?? '',
      arrDate,
      arrTime: arrTime?.time ?? '',
      confirmation,
      warnings,
    });
  });

  // the same flight can be listed twice (summary and details): keep the more complete one
  const filled = (d: FlightDraft) => [d.from, d.to, d.depDate, d.depTime, d.arrDate, d.arrTime].filter(Boolean).length;
  const unique = new Map<string, FlightDraft>();
  for (const d of drafts) {
    const key = `${d.flightNumber}|${d.depDate || d.from}`;
    const prev = unique.get(key);
    if (!prev || filled(d) > filled(prev)) unique.set(key, d);
  }
  return [...unique.values()].sort((a, b) => `${a.depDate}${a.depTime}`.localeCompare(`${b.depDate}${b.depTime}`));
}

// ---- hotels ----------------------------------------------------------------
const IN_RE = /(?<![\p{L}])(check[\s-]?in|einchecken|anreise|заезд|заселение|チェックイン)(?![\p{L}])/giu;
const OUT_RE = /(?<![\p{L}])(check[\s-]?out|auschecken|abreise|выезд|チェックアウト)(?![\p{L}])/giu;
const HOTEL_WORD = /(hotel|inn\b|ryokan|hostel|resort|apartments?|guest\s?house|residence|suites?|lodge|villa|b&b|capsule|minshuku|отель|гостиниц|апартамент|хостел|ホテル|旅館)/i;
const NOISE = /(confirm|booking|reservation|buchung|bestätigung|брониров|подтвержд|price|total|preis|цена|итого|guests?\b|gast|check|anreise|abreise|заезд|выезд|address|adresse|адрес|\bphone\b|\btel\b|e-?mail|www\.|https?:|@|cancel|storn|отмен|nights?\b|nächte|ночей|ночи|room|zimmer|your |please|provide|contacting|notify|polic|operating hours|parking|deposit|tourist tax|thank|danke|спасибо|dear |payment|zahlung|оплат|\bpin\b|manage|view |click)/i;
const NAME_LABEL = /^(?:hotel|property(?: name)?|accommodation|unterkunft|hotelname|отель|название отеля|объект|ホテル名)\s*[:：]\s*(.+)$/i;
/** A line that is only the word "Hotel" / "Property"...: a heading, not a name. */
const NAME_WORD_ONLY = /^(?:hotel|property(?: name)?|accommodation|unterkunft|отель|объект|ホテル)\s*[:：]?$/i;
const ADDRESS_LABEL = /^(?:address|adresse|адрес|住所)\s*[:：]\s*(.+)$/i;

function allMatches(re: RegExp, text: string): { index: number; end: number }[] {
  re.lastIndex = 0;
  const out: { index: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ index: m.index, end: m.index + m[0].length });
  return out;
}

function parseHotels(text: string, opts: ParseOptions): HotelDraft[] {
  const ins = allMatches(IN_RE, text);
  const outs = allMatches(OUT_RE, text);
  if (!ins.length || !outs.length) return [];

  const dates = usableDates(text, opts);
  const times = findTimes(text);
  const confirmation = findConfirmation(text, 'hotel');
  const drafts: HotelDraft[] = [];
  let prevEnd = 0;

  ins.forEach((inLabel, i) => {
    const nextIn = ins[i + 1]?.index ?? text.length;
    const outLabel = outs.find(o => o.index > inLabel.end && o.index < nextIn);
    if (!outLabel) return;

    const dateAfter = (from: number, to: number) => dates.find(d => d.index >= from && d.index < Math.min(to, from + 160));
    const checkIn = dateAfter(inLabel.end, outLabel.index);
    const checkOut = dateAfter(outLabel.end, nextIn);
    if (!checkIn || !checkOut) return;

    const timeAfter = (d: FoundDate, limit: number) => times.find(t => t.index >= d.index + d.length && t.index < Math.min(limit, d.index + d.length + 60));
    const inTime = timeAfter(checkIn, outLabel.index);
    const outTime = timeAfter(checkOut, nextIn);

    const warnings: string[] = [];
    const { name, guessed } = findHotelName(text, Math.max(prevEnd, inLabel.index - 600), inLabel.index, checkOut.index + checkOut.length, nextIn);
    if (!name) warnings.push('Не удалось определить название. Введите вручную.');
    else if (guessed) warnings.push('Название определено по положению в документе. Проверьте.');
    if (!checkIn.hasYear) warnings.push(`В документе нет года, взят ${opts.defaultYear}.`);
    if (checkIn.ambiguous || checkOut.ambiguous) warnings.push('Формат даты неоднозначен (день/месяц). Проверьте.');
    if (checkOut.date <= checkIn.date) warnings.push('Дата выезда не позже даты заезда. Проверьте.');

    drafts.push({
      kind: 'hotel',
      name,
      address: findAddress(text, Math.max(prevEnd, inLabel.index - 600), Math.min(nextIn, checkOut.index + 400)),
      checkInDate: checkIn.date,
      checkInTime: inTime?.time ?? '',
      checkOutDate: checkOut.date,
      checkOutTime: outTime?.time ?? '',
      confirmation,
      warnings,
    });
    prevEnd = checkOut.index + checkOut.length;
  });

  const seen = new Set<string>();
  return drafts.filter(d => {
    const key = `${d.name}|${d.checkInDate}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });
}

function findHotelName(text: string, from: number, labelAt: number, afterFrom: number, afterTo: number): { name: string; guessed: boolean } {
  const lines = (a: number, b: number) => text.slice(a, b).split('\n').map(l => l.trim()).filter(Boolean);
  const before = lines(from, labelAt);
  const after = lines(afterFrom, Math.min(afterTo, afterFrom + 400)).slice(0, 5);

  for (const line of [...before, ...after]) {
    const m = NAME_LABEL.exec(line);
    if (m) return { name: clean(m[1]), guessed: false };
  }
  const ok = (l: string) => l.length >= 3 && l.length <= 80 && !NOISE.test(l) && !ADDRESS_LABEL.test(l) && !NAME_WORD_ONLY.test(l);

  // "Hotel" on its own line, the name on the next one (vouchers from travel agencies)
  const wide = [...before, ...lines(afterFrom, Math.min(afterTo, afterFrom + 900)).slice(0, 14)];
  for (let i = 0; i + 1 < wide.length; i++) {
    if (NAME_WORD_ONLY.test(wide[i]) && wide[i + 1].length >= 3 && wide[i + 1].length <= 90) {
      return { name: clean(wide[i + 1]), guessed: false };
    }
  }
  for (const line of [...before].reverse()) {
    if (ok(line) && HOTEL_WORD.test(line)) return { name: clean(line), guessed: false };
  }
  for (const line of after) {
    if (ok(line) && HOTEL_WORD.test(line)) return { name: clean(line), guessed: false };
  }
  for (const line of [...before].reverse()) {
    if (ok(line) && /\p{L}/u.test(line) && !/^\d/.test(line) && !findDates(line, 2000).length && !/\d{3}-\d{4}/.test(line)) return { name: clean(line), guessed: true };
  }
  return { name: '', guessed: false };
}

function findAddress(text: string, from: number, to: number): string {
  const lines = text.slice(from, to).split('\n').map(l => l.trim()).filter(Boolean);
  const labeled = lines.map(l => ADDRESS_LABEL.exec(l)).find(Boolean);
  if (labeled) return clean(labeled[1]);

  // "Address" on its own line, the address on the next one
  const at = lines.findIndex(l => /^(address|adresse|адрес|住所)\s*[:：]?$/i.test(l));
  if (at >= 0 && lines[at + 1]) return clean(lines[at + 1]);

  const postal = lines.find(l => /(〒|\b\d{3}-\d{4}\b)/.test(l) && l.length < 160 && !findDates(l, 2000).length);
  return postal ? clean(postal) : '';
}

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/^[\s:：\-–•*]+|[\s\-–•*]+$/g, '').trim();
}

// ---- entry point -----------------------------------------------------------
/** Finds flights and hotel stays in the text of a booking document. */
export function parseBookingText(raw: string, opts: ParseOptions): BookingDraft[] {
  const text = normalizeText(raw);
  if (!text) return [];
  return [...parseFlights(text, opts), ...parseHotels(text, opts)];
}
