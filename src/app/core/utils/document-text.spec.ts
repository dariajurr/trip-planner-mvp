import { chunksToLines, htmlToText, icsToDrafts, mergeDrafts, parseEml, parseIcs } from './document-text';
import { FlightDraft, HotelDraft } from './booking-parser';

const opts = { defaultYear: 2026 };
const enc = (s: string) => new TextEncoder().encode(s);
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

describe('chunksToLines', () => {
  const c = (str: string, x: number, y: number, width = str.length * 5, height = 10) => ({ str, x, y, width, height });

  it('rebuilds rows by y and orders by x, regardless of input order', () => {
    const lines = chunksToLines([c('Departure', 200, 700), c('LH 716', 10, 700), c('Check-in', 10, 650)]);
    expect(lines).toEqual(['LH 716   Departure', 'Check-in']);
  });

  it('puts a space between words but not inside split words', () => {
    const lines = chunksToLines([c('Fran', 10, 500, 20), c('kfurt', 30, 500, 25), c('(FRA)', 62, 500, 25)]);
    expect(lines).toEqual(['Frankfurt (FRA)']);
  });

  it('keeps rows with slightly different baselines together', () => {
    expect(chunksToLines([c('A', 10, 500), c('B', 40, 502)])).toEqual(['A B']);
  });

  it('ignores empty chunks', () => {
    expect(chunksToLines([c('', 10, 500), c('   ', 20, 500)])).toEqual([]);
  });
});

describe('htmlToText', () => {
  it('strips tags and scripts, keeps line breaks and decodes entities', () => {
    const t = htmlToText('<html><head><style>p{}</style></head><body><p>Check-in: <b>12 Dec</b></p><table><tr><td>Hotel</td><td>A &amp; B</td></tr></table><script>x()</script><br>Done&nbsp;&#8211;&#x41;</body></html>');
    expect(t).toContain('Check-in: 12 Dec');
    expect(t).toContain('Hotel A & B');
    expect(t).not.toContain('x()');
    expect(t).toContain('Done –A');
  });
});

describe('parseEml', () => {
  it('reads a multipart mail: base64 text, quoted-printable html, encoded subject, pdf and ics attachments', () => {
    const eml = [
      'From: booking@example.com',
      'Subject: =?UTF-8?B?' + b64('Бронь подтверждена') + '?=',
      'Date: Mon, 5 Oct 2026 10:00:00 +0200',
      'Content-Type: multipart/mixed; boundary="OUT"',
      '',
      '--OUT',
      'Content-Type: multipart/alternative; boundary="ALT"',
      '',
      '--ALT',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64('Check-in: 12 Dec 2026\nCheck-out: 19 Dec 2026'),
      '--ALT',
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      '<p>HTML =E2=80=94 version</p>',
      '--ALT--',
      '--OUT',
      'Content-Type: application/pdf; name="ticket.pdf"',
      'Content-Disposition: attachment; filename="ticket.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      b64('%PDF-fake'),
      '--OUT',
      'Content-Type: text/calendar; charset=utf-8',
      'Content-Disposition: attachment; filename="trip.ics"',
      '',
      'BEGIN:VCALENDAR',
      'END:VCALENDAR',
      '--OUT--',
      '',
    ].join('\r\n');

    const r = parseEml(enc(eml));
    expect(r.subject).toBe('Бронь подтверждена');
    expect(r.text).toBe('Check-in: 12 Dec 2026\nCheck-out: 19 Dec 2026');
    expect(r.attachments.map(a => [a.name, a.mime])).toEqual([['ticket.pdf', 'application/pdf'], ['trip.ics', 'text/calendar']]);
    expect(new TextDecoder().decode(r.attachments[0].data)).toBe('%PDF-fake');
  });

  it('falls back to html when there is no plain part, and survives garbage', () => {
    const r = parseEml(enc('Subject: x\r\nContent-Type: text/html\r\n\r\n<p>Hello</p>'));
    expect(r.text).toBe('Hello');
    expect(parseEml(enc('not an email at all')).attachments).toEqual([]);
  });
});

describe('parseIcs / icsToDrafts', () => {
  const ICS = `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Flight LH 716 FRA-HND
DTSTART;TZID=Europe/Berlin:20261212T114500
DTEND;TZID=Asia/Tokyo:20261213T071000
LOCATION:Frankfurt Airport
END:VEVENT
BEGIN:VEVENT
SUMMARY:Hotel Gracery Shinjuku
DTSTART;VALUE=DATE:20261212
DTEND;VALUE=DATE:20261219
LOCATION:1-19-1 Kabukicho\\, Shinjuku
END:VEVENT
BEGIN:VEVENT
SUMMARY:Dentist
DTSTART:20261001T080000Z
END:VEVENT
BEGIN:VEVENT
SUMMARY:Return NH 212 HND-FRA
DTSTART:20261219T141000Z
DTEND:20261219T180000Z
END:VEVENT
END:VCALENDAR`;

  it('parses events with local, UTC and all-day dates', () => {
    const e = parseIcs(ICS);
    expect(e.length).toBe(4);
    expect(e[0].start).toEqual({ date: '2026-12-12', time: '11:45', utc: false });
    expect(e[1].allDay).toBe(true);
    expect(e[1].location).toBe('1-19-1 Kabukicho, Shinjuku');
    expect(e[2].start.utc).toBe(true);
  });

  it('turns flights and stays into drafts, skips other events, warns about UTC', () => {
    const d = icsToDrafts(parseIcs(ICS), opts);
    const f = d.filter((x): x is FlightDraft => x.kind === 'flight');
    const h = d.filter((x): x is HotelDraft => x.kind === 'hotel');
    expect(f.length).toBe(2);
    expect(f[0]).toEqual(jasmine.objectContaining({ flightNumber: 'LH 716', from: 'FRA', to: 'HND', depDate: '2026-12-12', depTime: '11:45', arrDate: '2026-12-13', arrTime: '07:10' }));
    expect(f[1].warnings.join(' ')).toContain('UTC');
    expect(h.length).toBe(1);
    expect(h[0]).toEqual(jasmine.objectContaining({ name: 'Hotel Gracery Shinjuku', checkInDate: '2026-12-12', checkOutDate: '2026-12-19' }));
  });
});

describe('mergeDrafts', () => {
  const flight = (over: Partial<FlightDraft>): FlightDraft => ({ kind: 'flight', flightNumber: 'LH 716', airline: '', from: '', to: '', depDate: '2026-12-12', depTime: '', arrDate: '', arrTime: '', confirmation: '', warnings: [], ...over });

  it('keeps the more complete duplicate and sorts by date', () => {
    const out = mergeDrafts([flight({ depDate: '2026-12-19', flightNumber: 'LH 717' }), flight({}), flight({ from: 'FRA', to: 'HND', depTime: '11:45' })]);
    expect(out.length).toBe(2);
    expect((out[0] as FlightDraft).from).toBe('FRA');
    expect((out[1] as FlightDraft).flightNumber).toBe('LH 717');
  });
});
