import { Booking, FlightBooking, HotelBooking } from '../models';
import { FlightDraft, HotelDraft } from './booking-parser';
import { airportName, bookingToDraft, bookingsForDay, draftErrors, draftToBooking, nightsWithoutHotel, suggestTripRange } from './booking-utils';

const flightDraft = (over: Partial<FlightDraft> = {}): FlightDraft => ({ kind: 'flight', flightNumber: 'lh716', airline: 'Lufthansa', from: 'fra', to: 'hnd', depDate: '2026-12-12', depTime: '11:45', arrDate: '2026-12-13', arrTime: '07:10', confirmation: 'X7K2LM', warnings: [], ...over });
const hotelDraft = (over: Partial<HotelDraft> = {}): HotelDraft => ({ kind: 'hotel', name: 'Hotel Gracery', address: '', checkInDate: '2026-12-12', checkInTime: '15:00', checkOutDate: '2026-12-19', checkOutTime: '', confirmation: '', warnings: [], ...over });

const out: FlightBooking = { id: 'f1', tripId: 't', kind: 'flight', flightNumber: 'LH 716', from: 'FRA', to: 'HND', departure: { date: '2026-12-12', time: '11:45' }, arrival: { date: '2026-12-13', time: '07:10' } };
const back: FlightBooking = { id: 'f2', tripId: 't', kind: 'flight', flightNumber: 'LH 717', from: 'HND', to: 'FRA', departure: { date: '2026-12-19', time: '23:15' }, arrival: { date: '2026-12-20', time: '05:40' } };
const hotel = (id: string, a: string, b: string): HotelBooking => ({ id, tripId: 't', kind: 'hotel', name: id, checkIn: { date: a }, checkOut: { date: b } });

describe('draftErrors', () => {
  it('accepts a complete draft and explains problems in a bad one', () => {
    expect(draftErrors(flightDraft())).toEqual([]);
    expect(draftErrors(hotelDraft())).toEqual([]);
    expect(draftErrors(flightDraft({ flightNumber: '', from: 'F', depDate: '' }))).toEqual(['Укажите номер рейса.', 'Аэропорт вылета: три латинские буквы, например FRA.', 'Укажите дату вылета.']);
    expect(draftErrors(hotelDraft({ name: ' ', checkOutDate: '2026-12-01' }))).toEqual(['Укажите название отеля.', 'Выезд раньше заезда.']);
    expect(draftErrors(flightDraft({ depTime: '25:00' }))).toEqual(['Время вылета в формате 11:45.']);
  });
});

describe('draft <-> booking', () => {
  it('normalises flight numbers and airport codes and drops empty fields', () => {
    const b = draftToBooking(flightDraft({ confirmation: '' }), { id: 'x', tripId: 't' }) as FlightBooking;
    expect(b.flightNumber).toBe('LH 716');
    expect([b.from, b.to]).toEqual(['FRA', 'HND']);
    expect('confirmation' in b).toBe(false);
    expect(b.arrival).toEqual({ date: '2026-12-13', time: '07:10' });
  });

  it('keeps attachments and round-trips through a draft', () => {
    const att = [{ id: 'u-doc-1', name: 'a.pdf', mime: 'application/pdf', size: 10 }];
    const b = draftToBooking(hotelDraft({ cityId: 'tokyo' }), { id: 'h', tripId: 't', attachments: att }) as HotelBooking;
    expect(b.attachments).toEqual(att);
    expect(b.cityId).toBe('tokyo');
    expect(draftToBooking(bookingToDraft(b), { id: 'h', tripId: 't', attachments: att })).toEqual(b);
  });

  it('arrival date defaults to the departure date when only a time is given', () => {
    const b = draftToBooking(flightDraft({ arrDate: '' }), { id: 'x', tripId: 't' }) as FlightBooking;
    expect(b.arrival?.date).toBe('2026-12-12');
  });
});

describe('suggestTripRange', () => {
  it('uses hotels, and the flight into/out of the trip country', () => {
    expect(suggestTripRange([out, back, hotel('h', '2026-12-13', '2026-12-19')], ['JP'])).toEqual({ start: '2026-12-13', end: '2026-12-19' });
  });

  it('works with flights only: arrival date at the destination to the departure date home', () => {
    expect(suggestTripRange([out, back], ['JP'])).toEqual({ start: '2026-12-13', end: '2026-12-19' });
  });

  it('ignores the leg home landing in the traveller\'s own country, and connecting legs', () => {
    const connect: FlightBooking = { ...out, id: 'c', from: 'FRA', to: 'IST', departure: { date: '2026-12-12' }, arrival: { date: '2026-12-12' } };
    const onward: FlightBooking = { ...out, id: 'o', from: 'IST', to: 'HND', departure: { date: '2026-12-12', time: '23:00' }, arrival: { date: '2026-12-13' } };
    expect(suggestTripRange([connect, onward, back], ['JP'])).toEqual({ start: '2026-12-13', end: '2026-12-19' });
  });

  it('falls back to all dates without country info and returns null for nothing', () => {
    expect(suggestTripRange([out, back], [])!.start).toBe('2026-12-12');
    expect(suggestTripRange([], ['JP'])).toBeNull();
  });
});

describe('a real multi-country itinerary (Moscow - Guangzhou - Tokyo - Nha Trang - Moscow)', () => {
  const leg = (id: string, n: string, from: string, to: string, d1: string, t1: string, d2: string, t2: string): FlightBooking => ({
    id, tripId: 't', kind: 'flight', flightNumber: n, from, to, departure: { date: d1, time: t1 }, arrival: { date: d2, time: t2 },
  });
  const legs = [
    leg('1', 'CZ 656', 'SVO', 'CAN', '2026-11-30', '23:15', '2026-12-01', '13:30'),
    leg('2', 'CZ 3085', 'CAN', 'HND', '2026-12-01', '15:10', '2026-12-01', '20:00'),
    leg('3', 'CZ 3086', 'HND', 'CAN', '2026-12-08', '10:45', '2026-12-08', '15:00'),
    leg('4', 'CZ 6049', 'CAN', 'CXR', '2026-12-08', '16:15', '2026-12-08', '17:40'),
    leg('5', 'CZ 8476', 'CXR', 'CAN', '2026-12-12', '10:40', '2026-12-12', '14:30'),
    leg('6', 'CZ 8027', 'CAN', 'SVO', '2026-12-13', '07:40', '2026-12-13', '13:00'),
  ];

  it('the Japan part of the trip is from landing in Tokyo to leaving Tokyo', () => {
    expect(suggestTripRange([...legs, hotel('Tourist Hotel', '2026-12-01', '2026-12-08')], ['JP'])).toEqual({ start: '2026-12-01', end: '2026-12-08' });
    expect(suggestTripRange(legs, ['JP'])).toEqual({ start: '2026-12-01', end: '2026-12-08' });
  });

  it('with no country restriction the whole journey counts', () => {
    expect(suggestTripRange(legs, [])).toEqual({ start: '2026-11-30', end: '2026-12-13' });
  });

  it('shows both times for a flight that lands the same day, and the landing on the next day separately', () => {
    expect(bookingsForDay(legs, '2026-12-01').map(l => `${l.kind} ${l.title} ${l.detail}`)).toEqual([
      'flight-arr CZ 656 · SVO → CAN прилёт 13:30',
      'flight-dep CZ 3085 · CAN → HND вылет 15:10 → прилёт 20:00',
    ]);
  });
});

describe('bookingsForDay', () => {
  const all: Booking[] = [out, back, hotel('Gracery', '2026-12-13', '2026-12-19')];

  it('describes each kind of day', () => {
    expect(bookingsForDay(all, '2026-12-12').map(l => l.kind)).toEqual(['flight-dep']);
    expect(bookingsForDay(all, '2026-12-13').map(l => l.kind)).toEqual(['flight-arr', 'hotel-in']);
    expect(bookingsForDay(all, '2026-12-15').map(l => l.kind)).toEqual(['hotel-stay']);
    expect(bookingsForDay(all, '2026-12-19').map(l => l.kind)).toEqual(['hotel-out', 'flight-dep']); // check-out in the morning, the flight at night
    expect(bookingsForDay(all, '2026-12-25')).toEqual([]);
  });

  it('formats times', () => {
    const [dep] = bookingsForDay(all, '2026-12-12');
    expect(dep.title).toBe('LH 716 · FRA → HND');
    expect(dep.detail).toBe('вылет 11:45');
  });
});

describe('nightsWithoutHotel', () => {
  it('finds uncovered nights, none when there are no hotels', () => {
    const hs = [hotel('a', '2026-12-13', '2026-12-15'), hotel('b', '2026-12-16', '2026-12-19')];
    expect(nightsWithoutHotel(hs, '2026-12-13', '2026-12-19')).toEqual(['2026-12-15']);
    expect(nightsWithoutHotel([out], '2026-12-13', '2026-12-19')).toEqual([]);
  });
});

describe('airportName', () => {
  it('names known airports and falls back to the code', () => {
    expect(airportName('HND')).toBe('Tokyo Haneda');
    expect(airportName('ZZZ')).toBe('ZZZ');
  });
});
