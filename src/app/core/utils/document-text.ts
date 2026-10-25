import { AIRLINES } from '../data/airports';
import { BookingDraft, FlightDraft, HotelDraft, ParseOptions, parseBookingText } from './booking-parser';
import { addDay } from './booking-dates';

// ---- PDF: rebuild lines from positioned text chunks ------------------------
export interface TextChunk {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** PDF text comes as loose chunks with coordinates; rows must be rebuilt for the parser to see lines. */
export function chunksToLines(chunks: TextChunk[]): string[] {
  const items = chunks.filter(c => c.str.trim() !== '' || c.str === ' ');
  items.sort((a, b) => b.y - a.y || a.x - b.x);

  const rows: TextChunk[][] = [];
  for (const item of items) {
    const row = rows[rows.length - 1];
    const tolerance = Math.max(2, (row?.[0].height ?? item.height) * 0.5);
    if (row && Math.abs(row[0].y - item.y) <= tolerance) row.push(item);
    else rows.push([item]);
  }

  return rows.map(row => {
    row.sort((a, b) => a.x - b.x);
    let line = '';
    let prevEnd: number | null = null;
    for (const c of row) {
      if (prevEnd !== null && c.str !== ' ') {
        const gap = c.x - prevEnd;
        const unit = Math.max(c.height, 1);
        if (gap > unit * 2.5) line += '   ';
        else if (gap > unit * 0.12 && !line.endsWith(' ') && !c.str.startsWith(' ')) line += ' ';
      }
      line += c.str;
      prevEnd = c.x + c.width;
    }
    return line.replace(/[ \t]+$/g, '');
  }).filter(l => l.trim() !== '');
}

// ---- HTML -------------------------------------------------------------------
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', euro: '€', copy: '©' };

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table|section|article|ul|ol)>/gi, '\n')
    .replace(/<\/(td|th)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    });
}

// ---- E-mail (.eml) ------------------------------------------------------------
export interface EmailAttachment {
  name: string;
  mime: string;
  data: Uint8Array;
}

export interface ParsedEmail {
  subject: string;
  date: string;
  text: string;
  attachments: EmailAttachment[];
}

const latin1 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return s;
};
const toBytes = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0) & 0xff);

function decodeCharset(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function decodeTransfer(body: string, encoding: string): Uint8Array {
  const enc = encoding.toLowerCase().trim();
  if (enc === 'base64') {
    try {
      return Uint8Array.from(atob(body.replace(/\s+/g, '')), c => c.charCodeAt(0));
    } catch {
      return new Uint8Array();
    }
  }
  if (enc === 'quoted-printable') {
    const joined = body.replace(/=\r?\n/g, '');
    const out: number[] = [];
    for (let i = 0; i < joined.length; i++) {
      if (joined[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(joined.slice(i + 1, i + 3))) {
        out.push(parseInt(joined.slice(i + 1, i + 3), 16));
        i += 2;
      } else {
        out.push(joined.charCodeAt(i) & 0xff);
      }
    }
    return Uint8Array.from(out);
  }
  return toBytes(body);
}

function parseHeaders(block: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of block.replace(/\r\n?/g, '\n').replace(/\n[ \t]+/g, ' ').split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return headers;
}

/** RFC 2047 encoded words in headers, e.g. =?UTF-8?B?...?= */
function decodeWords(value: string): string {
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, charset: string, enc: string, data: string) => {
    const bytes = enc.toUpperCase() === 'B' ? decodeTransfer(data, 'base64') : decodeTransfer(data.replace(/_/g, ' '), 'quoted-printable');
    return decodeCharset(bytes, charset);
  });
}

const param = (header: string, name: string) => new RegExp(`${name}\\*?=(?:"([^"]*)"|([^;\\s]+))`, 'i').exec(header)?.slice(1).find(Boolean) ?? '';

function walkPart(raw: string, out: { plain: string[]; html: string[]; attachments: EmailAttachment[] }): void {
  const split = raw.search(/\r?\n\r?\n/);
  const headerBlock = split >= 0 ? raw.slice(0, split) : raw;
  const body = split >= 0 ? raw.slice(split).replace(/^\r?\n\r?\n/, '') : '';
  const h = parseHeaders(headerBlock);
  const type = (h['content-type'] ?? 'text/plain').toLowerCase();
  const mime = type.split(';')[0].trim();

  if (mime.startsWith('multipart/')) {
    const boundary = param(h['content-type'] ?? '', 'boundary');
    if (!boundary) return;
    for (const part of body.split(`--${boundary}`).slice(1)) {
      if (part.startsWith('--')) break;
      walkPart(part.replace(/^\r?\n/, ''), out);
    }
    return;
  }

  const bytes = decodeTransfer(body, h['content-transfer-encoding'] ?? '7bit');
  const disposition = h['content-disposition'] ?? '';
  const name = decodeWords(param(disposition, 'filename') || param(h['content-type'] ?? '', 'name'));
  const isAttachment = /attachment/i.test(disposition) || (!!name && mime !== 'text/plain' && mime !== 'text/html');

  if (isAttachment || mime === 'application/pdf' || mime === 'text/calendar') {
    out.attachments.push({ name: name || (mime === 'text/calendar' ? 'invite.ics' : 'attachment'), mime, data: bytes });
  } else if (mime === 'text/html') {
    out.html.push(htmlToText(decodeCharset(bytes, param(type, 'charset'))));
  } else if (mime === 'text/plain') {
    out.plain.push(decodeCharset(bytes, param(type, 'charset')));
  }
}

export function parseEml(data: Uint8Array): ParsedEmail {
  const raw = latin1(data);
  const split = raw.search(/\r?\n\r?\n/);
  const headers = parseHeaders(split >= 0 ? raw.slice(0, split) : raw);
  const out = { plain: [] as string[], html: [] as string[], attachments: [] as EmailAttachment[] };
  walkPart(raw, out);

  return {
    subject: decodeWords(headers['subject'] ?? ''),
    date: headers['date'] ?? '',
    text: (out.plain.join('\n').trim() || out.html.join('\n')).trim(),
    attachments: out.attachments,
  };
}

// ---- Calendar (.ics) -----------------------------------------------------------
export interface IcsEvent {
  summary: string;
  description: string;
  location: string;
  start: { date: string; time?: string; utc: boolean };
  end?: { date: string; time?: string; utc: boolean };
  allDay: boolean;
}

function icsValue(v: string): string {
  return v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function icsDate(params: string, value: string): { date: string; time?: string; utc: boolean } | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return undefined;
  const hasTime = m[4] !== undefined && !/VALUE=DATE(?!-)/i.test(params);
  return { date: `${m[1]}-${m[2]}-${m[3]}`, ...(hasTime ? { time: `${m[4]}:${m[5]}` } : {}), utc: m[7] === 'Z' };
}

export function parseIcs(text: string): IcsEvent[] {
  const unfolded = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '');
  const events: IcsEvent[] = [];

  for (const block of unfolded.split('BEGIN:VEVENT').slice(1)) {
    const body = block.split('END:VEVENT')[0];
    const props: Record<string, { params: string; value: string }> = {};
    for (const line of body.split('\n')) {
      const m = /^([A-Z-]+)((?:;[^:]*)?):(.*)$/.exec(line);
      if (m) props[m[1]] ??= { params: m[2], value: m[3] };
    }
    const start = props['DTSTART'] && icsDate(props['DTSTART'].params, props['DTSTART'].value);
    if (!start) continue;
    events.push({
      summary: icsValue(props['SUMMARY']?.value ?? ''),
      description: icsValue(props['DESCRIPTION']?.value ?? ''),
      location: icsValue(props['LOCATION']?.value ?? ''),
      start,
      end: props['DTEND'] ? icsDate(props['DTEND'].params, props['DTEND'].value) : undefined,
      allDay: !start.time,
    });
  }
  return events;
}

const STAY_WORDS = /(hotel|stay|accommodation|check-?in|ryokan|hostel|apartment|airbnb|booking\.com|отель|unterkunft|übernachtung)/i;

/** Calendar entries that look like flights or stays. */
export function icsToDrafts(events: IcsEvent[], opts: ParseOptions): BookingDraft[] {
  const drafts: BookingDraft[] = [];

  for (const e of events) {
    const base = `${e.summary}\n${e.description}\n${e.location}`;
    const flightNumber = new RegExp(`(?<![A-Za-z0-9])(${Object.keys(AIRLINES).join('|')})\\s?\\d{1,4}(?![A-Za-z0-9])`).test(base);

    if (flightNumber && !e.allDay) {
      const synthetic = `${base}\n${e.start.date} ${e.start.time ?? ''}\n${e.end ? `${e.end.date} ${e.end.time ?? ''}` : ''}`;
      for (const d of parseBookingText(synthetic, opts)) {
        if (d.kind !== 'flight') continue;
        // the calendar knows the exact start: do not rely on guesses from the text
        d.depDate = e.start.date;
        d.depTime = e.start.time ?? d.depTime;
        if (e.end?.time) {
          d.arrDate = e.end.date;
          d.arrTime = e.end.time;
        }
        d.warnings = d.warnings.filter(w => !w.includes('Дата прилёта предположена'));
        if (e.start.utc) d.warnings.push('В календаре время указано в UTC, а не по местному. Проверьте.');
        drafts.push(d);
      }
    } else if (e.allDay && STAY_WORDS.test(base)) {
      const name = e.summary.replace(/^(check-?in|stay|booking|hotel)\s*[:\-–]\s*/i, '').trim();
      const stay: HotelDraft = {
        kind: 'hotel',
        name,
        address: e.location,
        checkInDate: e.start.date,
        checkInTime: '',
        // for all-day events DTEND is exclusive: it already is the check-out day
        checkOutDate: e.end?.date ?? addDay(e.start.date),
        checkOutTime: '',
        confirmation: '',
        warnings: name ? [] : ['Не удалось определить название. Введите вручную.'],
      };
      drafts.push(stay);
    }
  }
  return drafts;
}

// ---- merging results from several sources ---------------------------------------
const filled = (d: BookingDraft): number =>
  d.kind === 'flight'
    ? [d.from, d.to, d.depDate, d.depTime, d.arrDate, d.arrTime, d.confirmation].filter(Boolean).length
    : [d.name, d.address, d.checkInDate, d.checkInTime, d.checkOutDate, d.checkOutTime, d.confirmation].filter(Boolean).length;

/** The same flight or stay found in the e-mail body and in the PDF is kept once (the more complete one). */
export function mergeDrafts(drafts: BookingDraft[]): BookingDraft[] {
  const keyOf = (d: BookingDraft) =>
    d.kind === 'flight' ? `f|${d.flightNumber}|${d.depDate}` : `h|${d.checkInDate}|${d.checkOutDate}`;
  const map = new Map<string, BookingDraft>();
  for (const d of drafts) {
    const prev = map.get(keyOf(d));
    if (!prev || filled(d) > filled(prev)) map.set(keyOf(d), d);
  }
  const flights = [...map.values()].filter((d): d is FlightDraft => d.kind === 'flight').sort((a, b) => `${a.depDate}${a.depTime}`.localeCompare(`${b.depDate}${b.depTime}`));
  const hotels = [...map.values()].filter((d): d is HotelDraft => d.kind === 'hotel').sort((a, b) => a.checkInDate.localeCompare(b.checkInDate));
  return [...flights, ...hotels];
}
