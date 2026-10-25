import { AIRPORTS } from '../data/airports';
import { Booking, BookingAttachment, FlightBooking, HotelBooking } from '../models';
import { addDay } from './booking-dates';
import { BookingDraft, FlightDraft, HotelDraft } from './booking-parser';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const CODE = /^[A-Z]{3}$/;

export function airportName(code: string): string {
  return AIRPORTS[code]?.[0] ?? code;
}

/** Problems that prevent a draft from being saved. Empty array = valid. */
export function draftErrors(d: BookingDraft): string[] {
  const e: string[] = [];
  if (d.kind === 'flight') {
    if (!d.flightNumber.trim()) e.push('Укажите номер рейса.');
    if (!CODE.test(d.from.trim().toUpperCase())) e.push('Аэропорт вылета: три латинские буквы, например FRA.');
    if (!CODE.test(d.to.trim().toUpperCase())) e.push('Аэропорт прилёта: три латинские буквы, например HND.');
    if (!ISO.test(d.depDate)) e.push('Укажите дату вылета.');
    if (d.depTime && !TIME.test(d.depTime)) e.push('Время вылета в формате 11:45.');
    if (d.arrTime && !TIME.test(d.arrTime)) e.push('Время прилёта в формате 07:10.');
    if (d.arrDate && !ISO.test(d.arrDate)) e.push('Некорректная дата прилёта.');
  } else {
    if (!d.name.trim()) e.push('Укажите название отеля.');
    if (!ISO.test(d.checkInDate)) e.push('Укажите дату заезда.');
    if (!ISO.test(d.checkOutDate)) e.push('Укажите дату выезда.');
    if (ISO.test(d.checkInDate) && ISO.test(d.checkOutDate) && d.checkOutDate < d.checkInDate) e.push('Выезд раньше заезда.');
    if (d.checkInTime && !TIME.test(d.checkInTime)) e.push('Время заезда в формате 15:00.');
    if (d.checkOutTime && !TIME.test(d.checkOutTime)) e.push('Время выезда в формате 11:00.');
  }
  return e;
}

const opt = <T extends object>(obj: T): T => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined)) as T;

export function draftToBooking(
  d: BookingDraft,
  ctx: { id: string; tripId: string; attachments?: BookingAttachment[]; notes?: string },
): Booking {
  const common = opt({ id: ctx.id, tripId: ctx.tripId, confirmation: d.confirmation.trim(), notes: ctx.notes });
  const attachments = ctx.attachments?.length ? { attachments: ctx.attachments } : {};

  if (d.kind === 'flight') {
    const flight: FlightBooking = {
      ...common,
      kind: 'flight',
      flightNumber: d.flightNumber.trim().toUpperCase().replace(/^([A-Z0-9]{2})\s?(\d+)$/, '$1 $2'),
      ...opt({ airline: d.airline.trim() }),
      from: d.from.trim().toUpperCase(),
      to: d.to.trim().toUpperCase(),
      departure: opt({ date: d.depDate, time: d.depTime }) as FlightBooking['departure'],
      ...attachments,
    };
    if (d.arrDate || d.arrTime) {
      flight.arrival = opt({ date: d.arrDate || d.depDate, time: d.arrTime }) as FlightBooking['departure'];
    }
    return flight;
  }

  const hotel: HotelBooking = {
    ...common,
    kind: 'hotel',
    name: d.name.trim(),
    ...opt({ address: d.address.trim(), cityId: d.cityId ?? '' }),
    checkIn: opt({ date: d.checkInDate, time: d.checkInTime }) as HotelBooking['checkIn'],
    checkOut: opt({ date: d.checkOutDate, time: d.checkOutTime }) as HotelBooking['checkOut'],
    ...attachments,
  };
  return hotel;
}

export function bookingToDraft(b: Booking): BookingDraft {
  if (b.kind === 'flight') {
    const d: FlightDraft = {
      kind: 'flight',
      flightNumber: b.flightNumber,
      airline: b.airline ?? '',
      from: b.from,
      to: b.to,
      depDate: b.departure.date,
      depTime: b.departure.time ?? '',
      arrDate: b.arrival?.date ?? '',
      arrTime: b.arrival?.time ?? '',
      confirmation: b.confirmation ?? '',
      warnings: [],
    };
    return d;
  }
  const d: HotelDraft = {
    kind: 'hotel',
    name: b.name,
    address: b.address ?? '',
    checkInDate: b.checkIn.date,
    checkInTime: b.checkIn.time ?? '',
    checkOutDate: b.checkOut.date,
    checkOutTime: b.checkOut.time ?? '',
    confirmation: b.confirmation ?? '',
    cityId: b.cityId,
    warnings: [],
  };
  return d;
}

/**
 * Trip dates implied by the bookings: from the first arrival or check-in to the last departure
 * or check-out. Only flights that land in (or leave from) the trip's countries count as the
 * trip start/end, so connecting legs and the flight home do not stretch the trip.
 */
export function suggestTripRange(bookings: Booking[], tripCountries: string[]): { start: string; end: string } | null {
  const inTrip = (code: string) => tripCountries.length === 0 || tripCountries.includes(AIRPORTS[code]?.[1] ?? '');
  const starts: string[] = [];
  const ends: string[] = [];

  for (const b of bookings) {
    if (b.kind === 'hotel') {
      starts.push(b.checkIn.date);
      ends.push(b.checkOut.date);
    } else {
      // the flight lands in the trip's country: that is an arrival; leaves from it: a departure
      if (inTrip(b.to) && !inTrip(b.from)) starts.push(b.arrival?.date ?? b.departure.date);
      if (inTrip(b.from) && !inTrip(b.to)) ends.push(b.departure.date);
      // domestic flights and unknown airports: they just prove the traveller is there that day
      if (inTrip(b.from) && inTrip(b.to)) {
        starts.push(b.departure.date);
        ends.push(b.arrival?.date ?? b.departure.date);
      }
    }
  }
  if (!starts.length && !ends.length) return null;
  const all = [...starts, ...ends].sort();
  return { start: all[0], end: all[all.length - 1] };
}

export interface DayBookingLine {
  kind: 'flight-dep' | 'flight-arr' | 'hotel-in' | 'hotel-out' | 'hotel-stay';
  bookingId: string;
  icon: string;
  title: string;
  detail: string;
}

/** What the bookings say about one calendar day. */
export function bookingsForDay(bookings: Booking[], date: string): DayBookingLine[] {
  const lines: DayBookingLine[] = [];

  for (const b of bookings) {
    if (b.kind === 'flight') {
      const route = `${b.from} → ${b.to}`;
      if (b.departure.date === date) {
        // a flight that lands the same day shows both times on one line
        const landsToday = b.arrival?.date === date && b.arrival.time ? ` → прилёт ${b.arrival.time}` : '';
        lines.push({ kind: 'flight-dep', bookingId: b.id, icon: '✈️', title: `${b.flightNumber} · ${route}`, detail: `${b.departure.time ? `вылет ${b.departure.time}` : 'вылет'}${landsToday}` });
      }
      if (b.arrival && b.arrival.date === date && b.arrival.date !== b.departure.date) {
        lines.push({ kind: 'flight-arr', bookingId: b.id, icon: '🛬', title: `${b.flightNumber} · ${route}`, detail: b.arrival.time ? `прилёт ${b.arrival.time}` : 'прилёт' });
      }
    } else {
      if (b.checkIn.date === date) {
        lines.push({ kind: 'hotel-in', bookingId: b.id, icon: '🏨', title: b.name, detail: b.checkIn.time ? `заезд с ${b.checkIn.time}` : 'заезд' });
      } else if (b.checkOut.date === date) {
        lines.push({ kind: 'hotel-out', bookingId: b.id, icon: '🧳', title: b.name, detail: b.checkOut.time ? `выезд до ${b.checkOut.time}` : 'выезд' });
      } else if (b.checkIn.date < date && date < b.checkOut.date) {
        lines.push({ kind: 'hotel-stay', bookingId: b.id, icon: '🛏️', title: b.name, detail: 'ночёвка' });
      }
    }
  }
  // chronological; when a booking has no time, a typical one is assumed so the day still reads in order
  const typical = { 'hotel-out': '10:00', 'flight-arr': '12:00', 'flight-dep': '12:00', 'hotel-in': '15:00', 'hotel-stay': '23:59' } as const;
  const clock = (l: (typeof lines)[number]) => /(\d{2}:\d{2})/.exec(l.detail)?.[1] ?? typical[l.kind];
  return lines.sort((a, b) => clock(a).localeCompare(clock(b)) || a.kind.localeCompare(b.kind));
}

/** Nights (dates) in [start, end) that no hotel booking covers. Empty when there are no hotel bookings at all. */
export function nightsWithoutHotel(bookings: Booking[], start: string, end: string): string[] {
  const hotels = bookings.filter((b): b is HotelBooking => b.kind === 'hotel');
  if (!hotels.length) return [];

  const missing: string[] = [];
  for (let d = start; d < end; d = addDay(d)) {
    if (!hotels.some(h => h.checkIn.date <= d && d < h.checkOut.date)) missing.push(d);
  }
  return missing;
}
